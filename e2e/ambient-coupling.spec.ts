import { test, expect } from '@playwright/test';

/**
 * Manually dragging the paint-temperature slider should nudge the
 * world's ambient air temperature too, so the heat-map view actually
 * reacts to the slider. Auto-syncing the slider via element selection
 * must NOT touch ambient (selecting Lava should not heat the room).
 */
test('manual slider drag updates world ambient; element auto-sync does not', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { flux?: unknown }).flux, {
    timeout: 15_000,
  });

  // 1. Fresh scene — ambient starts at 0°.
  const initial = await page.evaluate(() => {
    const f = (window as unknown as {
      flux: { simulation: { lookups: { emitTemp: Int8Array }; }; getIdByKey: (k: string) => number };
    }).flux;
    return f.simulation.lookups.emitTemp[f.getIdByKey('empty')];
  });
  expect(initial).toBe(0);

  // 2. Select lava — paintTemp auto-syncs to 110, but ambient must NOT change.
  const afterAutoSync = await page.evaluate(() => {
    const f = (window as unknown as {
      flux: {
        store: { getState: () => { setSelected: (k: string) => void; paintTemp: number } };
        simulation: { lookups: { emitTemp: Int8Array } };
        getIdByKey: (k: string) => number;
      };
    }).flux;
    f.store.getState().setSelected('lava');
    return {
      paintTemp: f.store.getState().paintTemp,
      ambient: f.simulation.lookups.emitTemp[f.getIdByKey('empty')],
    };
  });
  expect(afterAutoSync.paintTemp).toBe(110);
  expect(afterAutoSync.ambient).toBe(0);

  // 3. Manual drag the slider to 80° — ambient should follow.
  const afterManual = await page.evaluate(() => {
    const f = (window as unknown as {
      flux: {
        store: { getState: () => { setPaintTempManual: (t: number) => void; paintTemp: number } };
        simulation: { lookups: { emitTemp: Int8Array } };
        getIdByKey: (k: string) => number;
      };
    }).flux;
    f.store.getState().setPaintTempManual(80);
    return {
      paintTemp: f.store.getState().paintTemp,
      ambient: f.simulation.lookups.emitTemp[f.getIdByKey('empty')],
    };
  });
  expect(afterManual.paintTemp).toBe(80);
  expect(afterManual.ambient).toBe(80);

  // 4. Now select water — paintTemp auto-syncs to 10, but ambient stays 80.
  const afterSecondAutoSync = await page.evaluate(() => {
    const f = (window as unknown as {
      flux: {
        store: { getState: () => { setSelected: (k: string) => void; paintTemp: number } };
        simulation: { lookups: { emitTemp: Int8Array } };
        getIdByKey: (k: string) => number;
      };
    }).flux;
    f.store.getState().setSelected('water');
    return {
      paintTemp: f.store.getState().paintTemp,
      ambient: f.simulation.lookups.emitTemp[f.getIdByKey('empty')],
    };
  });
  expect(afterSecondAutoSync.paintTemp).toBe(10);
  expect(afterSecondAutoSync.ambient).toBe(80);
});

test('new ambient pulls existing empty cells over time', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { flux?: unknown }).flux, {
    timeout: 15_000,
  });

  await page.evaluate(() => {
    const f = (window as unknown as {
      flux: {
        store: { getState: () => { setPaintTempManual: (t: number) => void } };
        simulation: { field: { set: (x: number, y: number, t: number) => void } };
      };
    }).flux;
    // Seed the probe cell at 50° BEFORE the ambient change so we can
    // check that the snap overwrote it.
    f.simulation.field.set(100, 100, 50);
    f.store.getState().setPaintTempManual(80);
  });

  // Snap is immediate — no need to wait.
  const temp = await page.evaluate(() => {
    const f = (window as unknown as {
      flux: { simulation: { field: { get: (x: number, y: number) => number } } };
    }).flux;
    return f.simulation.field.get(100, 100);
  });

  console.log(`probe cell temp after ambient=80: ${temp}°`);
  expect(temp).toBe(80);
});
