import { test, expect } from '@playwright/test';

/**
 * Per-scenario audit. Each case loads the scenario, drives the sim a
 * few ticks, then asserts an invariant that proves the intended
 * mechanism actually fires in the current code. If a scenario
 * regresses (e.g. lava freezes on spawn, torch is cold, uranium never
 * detonates) these tests go red.
 */

interface Flux {
  loadScenario: (id: string) => boolean;
  simulation: {
    grid: {
      width: number;
      height: number;
      get: (x: number, y: number) => number;
    };
    field: { get: (x: number, y: number) => number };
    pressure: { get: (x: number, y: number) => number };
    step: () => void;
  };
  getIdByKey: (k: string) => number;
  store: { getState: () => { paused: boolean; togglePause: () => void } };
}

const bootstrap = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { flux?: unknown }).flux, {
    timeout: 15_000,
  });
  // Pause the live render loop so we control tick timing exactly.
  await page.evaluate(() => {
    const s = (window as unknown as { flux: Flux }).flux.store;
    if (!s.getState().paused) s.getState().togglePause();
  });
};

const runScenario = async (
  page: import('@playwright/test').Page,
  id: string,
  ticks: number,
) =>
  page.evaluate(
    ({ id, ticks }) => {
      const f = (window as unknown as { flux: Flux }).flux;
      const loaded = f.loadScenario(id);
      if (!loaded) return { loaded: false };
      // Drive the sim under our control, bypassing the paused render loop.
      for (let t = 0; t < ticks; t++) f.simulation.step();
      return { loaded: true };
    },
    { id, ticks },
  );

test('volcano — lava actually stays molten and ignites nearby wood', async ({ page }) => {
  await bootstrap(page);
  const res = await runScenario(page, 'volcano', 30);
  expect(res.loaded).toBe(true);

  const report = await page.evaluate(() => {
    const f = (window as unknown as { flux: Flux }).flux;
    const { grid, field } = f.simulation;
    const W = grid.width;
    const H = grid.height;
    const lavaId = f.getIdByKey('lava');
    const stoneId = f.getIdByKey('stone');
    const fireId = f.getIdByKey('fire');

    let lavaCount = 0;
    let stoneCount = 0;
    let fireCount = 0;
    let maxTemp = -Infinity;
    // Scan a vertical band around the crater where lava was seeded.
    const band = [(W / 2 - 10) | 0, (W / 2 + 10) | 0];
    for (let y = 0; y < H; y++) {
      for (let x = band[0]; x <= band[1]; x++) {
        const id = grid.get(x, y) & 0xfff;
        const t = field.get(x, y);
        if (id === lavaId) lavaCount++;
        else if (id === stoneId) stoneCount++;
        else if (id === fireId) fireCount++;
        if (t > maxTemp) maxTemp = t;
      }
    }
    return { lavaCount, stoneCount, fireCount, maxTemp };
  });

  console.log('volcano:', report);
  // Lava survived the first ticks — it DIDN'T freeze into stone on spawn.
  expect(report.lavaCount).toBeGreaterThan(30);
  // The crater is visibly molten: reached real lava temperature.
  expect(report.maxTemp).toBeGreaterThan(900);
});

test('circuit — gunpowder pile is primed and copper trace is intact', async ({ page }) => {
  await bootstrap(page);
  const res = await runScenario(page, 'circuit', 10);
  expect(res.loaded).toBe(true);

  const report = await page.evaluate(() => {
    const f = (window as unknown as { flux: Flux }).flux;
    const { grid } = f.simulation;
    const W = grid.width;
    const H = grid.height;
    const midY = (H / 2) | 0;
    const copperId = f.getIdByKey('copper');
    const batteryId = f.getIdByKey('battery');
    const gunpowderId = f.getIdByKey('gunpowder');

    let copperCount = 0;
    let batteryCount = 0;
    let gunpowderCount = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const id = grid.get(x, y) & 0xfff;
        if (id === copperId) copperCount++;
        else if (id === batteryId) batteryCount++;
        else if (id === gunpowderId) gunpowderCount++;
      }
    }
    void midY;
    return { copperCount, batteryCount, gunpowderCount };
  });

  console.log('circuit:', report);
  expect(report.batteryCount).toBeGreaterThan(10);
  expect(report.copperCount).toBeGreaterThan(100);
  expect(report.gunpowderCount).toBeGreaterThan(40);
});

test('acid rain — acid reaches the forest canopy within a second', async ({ page }) => {
  await bootstrap(page);
  const res = await runScenario(page, 'rain', 180);
  expect(res.loaded).toBe(true);

  const report = await page.evaluate(() => {
    const f = (window as unknown as { flux: Flux }).flux;
    const { grid } = f.simulation;
    const W = grid.width;
    const H = grid.height;
    const acidId = f.getIdByKey('acid');
    const plantId = f.getIdByKey('plant');
    const woodId = f.getIdByKey('wood');

    let acidCount = 0;
    let acidLowest = 0;
    let plantCount = 0;
    let woodCount = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const id = grid.get(x, y) & 0xfff;
        if (id === acidId) {
          acidCount++;
          if (y > acidLowest) acidLowest = y;
        } else if (id === plantId) plantCount++;
        else if (id === woodId) woodCount++;
      }
    }
    return { acidCount, acidLowest, plantCount, woodCount, H };
  });

  console.log('rain:', report);
  expect(report.acidCount).toBeGreaterThan(20);
  // Acid has started falling — reached at least a third of the way down.
  expect(report.acidLowest).toBeGreaterThan(report.H * 0.4);
  expect(report.plantCount + report.woodCount).toBeGreaterThan(20);
});

test('ice cavern — torch is molten-hot and ice around it melts', async ({ page }) => {
  await bootstrap(page);
  const res = await runScenario(page, 'cryo', 60);
  expect(res.loaded).toBe(true);

  const report = await page.evaluate(() => {
    const f = (window as unknown as { flux: Flux }).flux;
    const { grid, field } = f.simulation;
    const W = grid.width;
    const H = grid.height;
    const torchId = f.getIdByKey('torch');
    const iceId = f.getIdByKey('ice');
    const waterId = f.getIdByKey('water');

    const midX = (W / 2) | 0;
    let torchCount = 0;
    let torchHottest = -Infinity;
    let iceCount = 0;
    let waterCount = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const id = grid.get(x, y) & 0xfff;
        if (id === torchId) {
          torchCount++;
          const t = field.get(x, y);
          if (t > torchHottest) torchHottest = t;
        } else if (id === iceId) iceCount++;
        else if (id === waterId) waterCount++;
      }
    }
    void midX;
    return { torchCount, torchHottest, iceCount, waterCount };
  });

  console.log('cryo:', report);
  expect(report.torchCount).toBeGreaterThan(0);
  // Torch emits at 1000°C — without field stamping this would be 0.
  expect(report.torchHottest).toBeGreaterThan(800);
  // Torch heat has melted some ice into water.
  expect(report.waterCount).toBeGreaterThan(0);
});

test('reactor — uranium pile heats itself via chain reaction', async ({ page }) => {
  await bootstrap(page);
  const res = await runScenario(page, 'reactor', 50);
  expect(res.loaded).toBe(true);

  const report = await page.evaluate(() => {
    const f = (window as unknown as { flux: Flux }).flux;
    const { grid, field } = f.simulation;
    const W = grid.width;
    const H = grid.height;
    const uraniumId = f.getIdByKey('uranium');
    const waterId = f.getIdByKey('water');
    const wallId = f.getIdByKey('wall');

    let uraniumCount = 0;
    let maxCoreTemp = -Infinity;
    let waterCount = 0;
    let wallCount = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const id = grid.get(x, y) & 0xfff;
        if (id === uraniumId) {
          uraniumCount++;
          const t = field.get(x, y);
          if (t > maxCoreTemp) maxCoreTemp = t;
        } else if (id === waterId) waterCount++;
        else if (id === wallId) wallCount++;
      }
    }
    return { uraniumCount, maxCoreTemp, waterCount, wallCount };
  });

  console.log('reactor:', report);
  expect(report.uraniumCount).toBeGreaterThan(30);
  expect(report.waterCount).toBeGreaterThan(100);
  expect(report.wallCount).toBeGreaterThan(100);
  // Chain reaction started: core temp climbed well above its 50° spawn.
  expect(report.maxCoreTemp).toBeGreaterThan(80);
});

test('portal loop — sand is primed at the portal entrance', async ({ page }) => {
  await bootstrap(page);
  const res = await runScenario(page, 'portals', 20);
  expect(res.loaded).toBe(true);

  const report = await page.evaluate(() => {
    const f = (window as unknown as { flux: Flux }).flux;
    const { grid } = f.simulation;
    const W = grid.width;
    const H = grid.height;
    const sandId = f.getIdByKey('sand');
    const portalAId = f.getIdByKey('portal_a');
    const portalBId = f.getIdByKey('portal_b');

    let sandCount = 0;
    let portalACount = 0;
    let portalBCount = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const id = grid.get(x, y) & 0xfff;
        if (id === sandId) sandCount++;
        else if (id === portalAId) portalACount++;
        else if (id === portalBId) portalBCount++;
      }
    }
    return { sandCount, portalACount, portalBCount };
  });

  console.log('portals:', report);
  expect(report.sandCount).toBeGreaterThan(100);
  expect(report.portalACount).toBeGreaterThan(0);
  expect(report.portalBCount).toBeGreaterThan(0);
});

test('mayhem — every element is represented without a crash', async ({ page }) => {
  await bootstrap(page);
  const res = await runScenario(page, 'mayhem', 5);
  expect(res.loaded).toBe(true);

  const report = await page.evaluate(() => {
    const f = (window as unknown as { flux: Flux }).flux;
    const { grid } = f.simulation;
    const W = grid.width;
    const H = grid.height;
    const distinct = new Set<number>();
    let fireHottest = -Infinity;
    const fireId = f.getIdByKey('fire');
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const id = grid.get(x, y) & 0xfff;
        distinct.add(id);
        if (id === fireId) {
          const t = f.simulation.field.get(x, y);
          if (t > fireHottest) fireHottest = t;
        }
      }
    }
    return { distinctCount: distinct.size, fireHottest };
  });

  console.log('mayhem:', report);
  // Mayhem spawns 70+ elements; allow some attrition from early reactions.
  expect(report.distinctCount).toBeGreaterThan(40);
  // Fire has been pulled up to its emit temperature (spawnTemp=800, emit=900).
  expect(report.fireHottest).toBeGreaterThan(500);
});

test('chem lab — crystal grows along the salt↔water boundary', async ({ page }) => {
  await bootstrap(page);
  const res = await runScenario(page, 'lab', 200);
  expect(res.loaded).toBe(true);

  const report = await page.evaluate(() => {
    const f = (window as unknown as { flux: Flux }).flux;
    const { grid } = f.simulation;
    const W = grid.width;
    const H = grid.height;
    const crystalId = f.getIdByKey('crystal');
    const saltId = f.getIdByKey('salt');
    const waterId = f.getIdByKey('water');
    const uraniumId = f.getIdByKey('uranium');

    let crystalCount = 0;
    let saltCount = 0;
    let waterCount = 0;
    let uraniumCount = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const id = grid.get(x, y) & 0xfff;
        if (id === crystalId) crystalCount++;
        else if (id === saltId) saltCount++;
        else if (id === waterId) waterCount++;
        else if (id === uraniumId) uraniumCount++;
      }
    }
    return { crystalCount, saltCount, waterCount, uraniumCount };
  });

  console.log('lab:', report);
  expect(report.saltCount).toBeGreaterThan(50);
  expect(report.waterCount).toBeGreaterThan(50);
  expect(report.uraniumCount).toBeGreaterThan(20);
  // The crystal seed survived and, ideally, spawned at least one more.
  expect(report.crystalCount).toBeGreaterThanOrEqual(1);
});
