import { test, expect } from '@playwright/test';

/**
 * Materials spawn at their real-world natural temperature regardless of
 * the ambient slider, and materials without one inherit the ambient.
 * The paint pipeline is driven through the exposed flux.paintDot
 * helper so the real resolveSpawnTemp logic is exercised.
 */
test('paintDot stamps each element at its natural °C', async ({ page }) => {
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

  expect(await probe('lava', 10, 10)).toBe(1100);
  expect(await probe('fire', 12, 10)).toBe(800);
  expect(await probe('torch', 14, 10)).toBe(1000);
  expect(await probe('ice', 16, 10)).toBe(-10);
  expect(await probe('snow', 18, 10)).toBe(-5);
  expect(await probe('cryo', 20, 10)).toBe(-196);
  expect(await probe('steam', 22, 10)).toBe(120);
  expect(await probe('water', 24, 10)).toBe(15);
  expect(await probe('spark', 26, 10)).toBe(300);
  expect(await probe('smoke', 28, 10)).toBe(200);
  expect(await probe('ash', 30, 10)).toBe(100);
});

test('materials without spawnTemp inherit the ambient slider', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { flux?: unknown }).flux, {
    timeout: 15_000,
  });

  // Ambient 20 → sand spawns at 20.
  const room = await page.evaluate(() => {
    const f = (window as unknown as {
      flux: {
        paintDot: (k: string, x: number, y: number) => void;
        simulation: { field: { get: (x: number, y: number) => number } };
        store: { getState: () => { setAmbientTemp: (t: number) => void } };
      };
    }).flux;
    f.store.getState().setAmbientTemp(20);
    f.paintDot('sand', 30, 30);
    return f.simulation.field.get(30, 30);
  });
  expect(room).toBe(20);

  // Ambient 400° → fresh sand spawns at 400.
  const warm = await page.evaluate(() => {
    const f = (window as unknown as {
      flux: {
        paintDot: (k: string, x: number, y: number) => void;
        simulation: { field: { get: (x: number, y: number) => number } };
        store: { getState: () => { setAmbientTemp: (t: number) => void } };
      };
    }).flux;
    f.store.getState().setAmbientTemp(400);
    f.paintDot('sand', 32, 30);
    return f.simulation.field.get(32, 30);
  });
  expect(warm).toBe(400);

  // Lava ignores ambient — always 1100°.
  const lava = await page.evaluate(() => {
    const f = (window as unknown as {
      flux: {
        paintDot: (k: string, x: number, y: number) => void;
        simulation: { field: { get: (x: number, y: number) => number } };
        store: { getState: () => { setAmbientTemp: (t: number) => void } };
      };
    }).flux;
    f.store.getState().setAmbientTemp(-100);
    f.paintDot('lava', 34, 30);
    return f.simulation.field.get(34, 30);
  });
  expect(lava).toBe(1100);
});
