import { test, expect } from '@playwright/test';

/**
 * The temperature slider is ambient-only: dragging it updates the
 * world's air temperature (empty.emitTemp + empty cells snap) and
 * selecting a different element never touches it.
 */
test('slider only drives ambient; selecting elements never touches it', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { flux?: unknown }).flux, {
    timeout: 15_000,
  });

  // Fresh scene — ambient starts at 0°.
  const initial = await page.evaluate(() => {
    const f = (window as unknown as {
      flux: {
        simulation: { lookups: { emitTemp: Int8Array } };
        getIdByKey: (k: string) => number;
        store: { getState: () => { ambientTemp: number } };
      };
    }).flux;
    return {
      ambient: f.store.getState().ambientTemp,
      emit: f.simulation.lookups.emitTemp[f.getIdByKey('empty')],
    };
  });
  expect(initial.ambient).toBe(0);
  expect(initial.emit).toBe(0);

  // Selecting lava does NOT touch ambient.
  const afterSelectLava = await page.evaluate(() => {
    const f = (window as unknown as {
      flux: {
        simulation: { lookups: { emitTemp: Int8Array } };
        getIdByKey: (k: string) => number;
        store: {
          getState: () => { setSelected: (k: string) => void; ambientTemp: number };
        };
      };
    }).flux;
    f.store.getState().setSelected('lava');
    return {
      ambient: f.store.getState().ambientTemp,
      emit: f.simulation.lookups.emitTemp[f.getIdByKey('empty')],
    };
  });
  expect(afterSelectLava.ambient).toBe(0);
  expect(afterSelectLava.emit).toBe(0);

  // Drag the slider to 80° — ambient + empty.emitTemp follow.
  const afterDrag = await page.evaluate(() => {
    const f = (window as unknown as {
      flux: {
        simulation: { lookups: { emitTemp: Int8Array } };
        getIdByKey: (k: string) => number;
        store: {
          getState: () => { setAmbientTemp: (t: number) => void; ambientTemp: number };
        };
      };
    }).flux;
    f.store.getState().setAmbientTemp(80);
    return {
      ambient: f.store.getState().ambientTemp,
      emit: f.simulation.lookups.emitTemp[f.getIdByKey('empty')],
    };
  });
  expect(afterDrag.ambient).toBe(80);
  expect(afterDrag.emit).toBe(80);

  // Selecting water still doesn't touch ambient.
  const afterSelectWater = await page.evaluate(() => {
    const f = (window as unknown as {
      flux: {
        simulation: { lookups: { emitTemp: Int8Array } };
        getIdByKey: (k: string) => number;
        store: {
          getState: () => { setSelected: (k: string) => void; ambientTemp: number };
        };
      };
    }).flux;
    f.store.getState().setSelected('water');
    return {
      ambient: f.store.getState().ambientTemp,
      emit: f.simulation.lookups.emitTemp[f.getIdByKey('empty')],
    };
  });
  expect(afterSelectWater.ambient).toBe(80);
  expect(afterSelectWater.emit).toBe(80);
});

test('new ambient snaps every existing empty cell instantly', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { flux?: unknown }).flux, {
    timeout: 15_000,
  });

  await page.evaluate(() => {
    const f = (window as unknown as {
      flux: {
        store: { getState: () => { setAmbientTemp: (t: number) => void } };
        simulation: { field: { set: (x: number, y: number, t: number) => void } };
      };
    }).flux;
    // Seed the probe cell to a random value BEFORE the ambient change so
    // we can check the snap overwrote it.
    f.simulation.field.set(100, 100, 50);
    f.store.getState().setAmbientTemp(80);
  });

  const temp = await page.evaluate(() => {
    const f = (window as unknown as {
      flux: { simulation: { field: { get: (x: number, y: number) => number } } };
    }).flux;
    return f.simulation.field.get(100, 100);
  });

  expect(temp).toBe(80);
});
