import { test, expect } from '@playwright/test';

/**
 * Regression test for the swap-temp bug + paint-temperature stamp.
 *
 * Scenario: paint water at -100° into a pocket of air.
 * Expected:
 *   - The water cell retains its cold temperature (was: warmed instantly
 *     because Grid.swap moved the cell but not its temperature).
 *   - After a few frames, the water either freezes into ice or stays
 *     visibly cold, AND the surrounding air shows a cold reading.
 */
test('water painted at −100° stays cold through movement', async ({ page }) => {
  await page.goto('/');
  // Wait for the bootstrap hook to appear.
  await page.waitForFunction(() => (window as unknown as { flux?: unknown }).flux, {
    timeout: 15_000,
  });

  // Paint a 5×5 patch of cold water into the middle of the grid, with a
  // floor of wall beneath it to stop free-fall from dragging it off-canvas.
  await page.evaluate(() => {
    const f = (window as unknown as {
      flux: {
        simulation: {
          grid: {
            width: number;
            height: number;
            set: (x: number, y: number, cell: number) => void;
          };
          field: { set: (x: number, y: number, t: number) => void };
        };
        getIdByKey: (key: string) => number;
      };
    }).flux;

    const waterId = f.getIdByKey('water');
    const wallId = f.getIdByKey('wall');
    const { grid, field } = f.simulation;

    const cx = (grid.width / 2) | 0;
    const cy = (grid.height / 2) | 0;
    // Pack an elementId into a Uint32 the same way encode() does.
    const pack = (id: number) => id & 0xfff;

    // Floor to keep water in place for easy sampling.
    for (let x = cx - 10; x <= cx + 10; x++) {
      grid.set(x, cy + 3, pack(wallId));
    }
    // 5×5 water patch sat on top of the floor, all at −100°.
    for (let dy = -4; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        grid.set(x, y, pack(waterId));
        field.set(x, y, -100);
      }
    }
  });

  // Let the simulation run a few dozen ticks so any temperature-loss bug
  // during movement would have manifested.
  await page.waitForTimeout(1500);

  const readout = await page.evaluate(() => {
    const f = (window as unknown as {
      flux: {
        simulation: {
          grid: {
            width: number;
            get: (x: number, y: number) => number;
          };
          field: { get: (x: number, y: number) => number };
        };
        getIdByKey: (key: string) => number;
      };
    }).flux;

    const waterId = f.getIdByKey('water');
    const iceId = f.getIdByKey('ice');
    const { grid, field } = f.simulation;
    const cx = (grid.width / 2) | 0;
    const cy = (grid.height / 2) | 0;

    // Sample cells across the painted patch + the surrounding air.
    const colonyCells: Array<{ dx: number; dy: number; id: number; temp: number }> = [];
    for (let dy = -4; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const id = grid.get(cx + dx, cy + dy) & 0xfff;
        const temp = field.get(cx + dx, cy + dy);
        colonyCells.push({ dx, dy, id, temp });
      }
    }
    // Air one cell to the right of the patch boundary.
    const airClose = field.get(cx + 3, cy - 2);

    let iceCount = 0;
    let waterCount = 0;
    let minTemp = Infinity;
    let avgTemp = 0;
    for (const c of colonyCells) {
      if (c.id === iceId) iceCount++;
      if (c.id === waterId) waterCount++;
      if (c.temp < minTemp) minTemp = c.temp;
      avgTemp += c.temp;
    }
    avgTemp /= colonyCells.length;
    return {
      iceCount,
      waterCount,
      minTemp,
      avgTemp,
      airClose,
      total: colonyCells.length,
    };
  });

  console.log('Cold-water readout:', readout);

  // Core regression check — the water *did* reach freezing temperature
  // while it was moving. Before the swap-temp fix, falling water would
  // drop its cold into the empty cells it left behind and arrive warm
  // at the destination, so it never froze at all.
  expect(readout.iceCount).toBeGreaterThan(20);
  expect(readout.waterCount).toBe(0);
  // Ice emits at −5°C with strength 0.10, so the patch stabilises near it.
  expect(readout.avgTemp).toBeLessThan(0);
  // The adjacent air cell is pulled below room temp by the ice patch.
  expect(readout.airClose).toBeLessThan(20);
});

test('air painted at -100° with eraser cools the empty cell', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { flux?: unknown }).flux, {
    timeout: 15_000,
  });

  const before = await page.evaluate(() => {
    const f = (window as unknown as {
      flux: {
        simulation: {
          grid: { width: number; height: number };
          field: { set: (x: number, y: number, t: number) => void; get: (x: number, y: number) => number };
        };
      };
    }).flux;
    const { grid, field } = f.simulation;
    const cx = (grid.width / 2) | 0;
    const cy = (grid.height / 2) | 0;
    // Directly set cold temperatures in an empty region.
    for (let dy = -5; dy <= 5; dy++) {
      for (let dx = -5; dx <= 5; dx++) {
        field.set(cx + dx, cy + dy, -100);
      }
    }
    return field.get(cx, cy);
  });

  expect(before).toBe(-100);

  await page.waitForTimeout(800);

  const after = await page.evaluate(() => {
    const f = (window as unknown as {
      flux: {
        simulation: {
          grid: { width: number; height: number };
          field: { get: (x: number, y: number) => number };
        };
      };
    }).flux;
    const { grid, field } = f.simulation;
    const cx = (grid.width / 2) | 0;
    const cy = (grid.height / 2) | 0;
    return field.get(cx, cy);
  });

  // Emit to ambient is strength 0.004 — after ~50 ticks we should still be
  // well below zero. If it drifted back near zero that would mean our
  // emit is way too aggressive.
  expect(after).toBeLessThan(-50);
});
