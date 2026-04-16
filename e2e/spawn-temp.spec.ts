import { test, expect } from '@playwright/test';

/**
 * Materials spawn at their natural temperature regardless of the
 * ambient slider, and materials without one inherit the ambient.
 * The paint pipeline is driven through the exposed flux.paintDot
 * helper so the real resolveSpawnTemp logic is exercised.
 */
test('paintDot stamps each element at its natural temperature', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { flux?: unknown }).flux, {
    timeout: 15_000,
  });

  const probe = async (key: string, x: number, y: number) =>
    page.evaluate(
      ({ key, x, y }) => {
        const f = (window as unknown as {
          flux: {
            paintDot: (k: string, x: number, y: number) => void;
            simulation: { field: { get: (x: number, y: number) => number } };
          };
        }).flux;
        f.paintDot(key, x, y);
        return f.simulation.field.get(x, y);
      },
      { key, x, y },
    );

  expect(await probe('lava', 10, 10)).toBe(110);
  expect(await probe('fire', 12, 10)).toBe(85);
  expect(await probe('torch', 14, 10)).toBe(120);
  expect(await probe('ice', 16, 10)).toBe(-20);
  expect(await probe('snow', 18, 10)).toBe(-10);
  expect(await probe('cryo', 20, 10)).toBe(-80);
  expect(await probe('steam', 22, 10)).toBe(95);
  expect(await probe('water', 24, 10)).toBe(10);
});

test('materials without spawnTemp inherit the ambient slider', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { flux?: unknown }).flux, {
    timeout: 15_000,
  });

  // Ambient 0 → sand spawns at 0.
  const cold = await page.evaluate(() => {
    const f = (window as unknown as {
      flux: {
        paintDot: (k: string, x: number, y: number) => void;
        simulation: { field: { get: (x: number, y: number) => number } };
        store: { getState: () => { setAmbientTemp: (t: number) => void } };
      };
    }).flux;
    f.store.getState().setAmbientTemp(0);
    f.paintDot('sand', 30, 30);
    return f.simulation.field.get(30, 30);
  });
  expect(cold).toBe(0);

  // Ambient 55 → fresh sand spawns at 55.
  const warm = await page.evaluate(() => {
    const f = (window as unknown as {
      flux: {
        paintDot: (k: string, x: number, y: number) => void;
        simulation: { field: { get: (x: number, y: number) => number } };
        store: { getState: () => { setAmbientTemp: (t: number) => void } };
      };
    }).flux;
    f.store.getState().setAmbientTemp(55);
    f.paintDot('sand', 32, 30);
    return f.simulation.field.get(32, 30);
  });
  expect(warm).toBe(55);

  // But lava still spawns at 110 regardless of a cold ambient.
  const lava = await page.evaluate(() => {
    const f = (window as unknown as {
      flux: {
        paintDot: (k: string, x: number, y: number) => void;
        simulation: { field: { get: (x: number, y: number) => number } };
        store: { getState: () => { setAmbientTemp: (t: number) => void } };
      };
    }).flux;
    f.store.getState().setAmbientTemp(-50);
    f.paintDot('lava', 34, 30);
    return f.simulation.field.get(34, 30);
  });
  expect(lava).toBe(110);
});
