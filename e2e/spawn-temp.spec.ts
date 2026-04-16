import { test, expect } from '@playwright/test';

/**
 * Each material should spawn at its natural temperature regardless of
 * the world's ambient 0°. Lava arrives molten, ice arrives frozen,
 * cryo arrives liquid-nitrogen cold.
 */
test('selecting an element syncs paint-temp to its natural spawn temperature', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { flux?: unknown }).flux, {
    timeout: 15_000,
  });

  const probe = async (key: string) => {
    return await page.evaluate(
      ({ key }) => {
        const f = (window as unknown as {
          flux: {
            store: {
              getState: () => { paintTemp: number; setSelected: (k: string) => void };
            };
          };
        }).flux;
        f.store.getState().setSelected(key);
        return f.store.getState().paintTemp;
      },
      { key },
    );
  };

  expect(await probe('lava')).toBe(110);
  expect(await probe('fire')).toBe(85);
  expect(await probe('torch')).toBe(120);
  expect(await probe('ice')).toBe(-20);
  expect(await probe('snow')).toBe(-10);
  expect(await probe('cryo')).toBe(-80);
  expect(await probe('steam')).toBe(95);
  expect(await probe('water')).toBe(10);
  expect(await probe('uranium')).toBe(30);
  expect(await probe('sand')).toBe(20); // no spawnTemp → default 20
  expect(await probe('stone')).toBe(20);
  expect(await probe('wood')).toBe(20);
});

test('freshly painted lava actually starts hot and cools over time', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { flux?: unknown }).flux, {
    timeout: 15_000,
  });

  // Select lava (paintTemp should auto-sync to 110) then paint a patch.
  const sandwichedTemp = await page.evaluate(() => {
    const f = (window as unknown as {
      flux: {
        store: {
          getState: () => {
            paintTemp: number;
            paused: boolean;
            setSelected: (k: string) => void;
            togglePause: () => void;
          };
        };
        simulation: {
          grid: { width: number; height: number; set: (x: number, y: number, c: number) => void };
          field: { set: (x: number, y: number, t: number) => void; get: (x: number, y: number) => number };
        };
        getIdByKey: (k: string) => number;
      };
    }).flux;
    const s = f.store.getState();
    s.setSelected('lava');
    if (!s.paused) s.togglePause();

    const autoTemp = f.store.getState().paintTemp;
    const lavaId = f.getIdByKey('lava');
    const wallId = f.getIdByKey('wall');

    const cx = (f.simulation.grid.width / 2) | 0;
    const cy = (f.simulation.grid.height / 2) | 0;
    // Wall containment so lava can't drift out before we sample it.
    for (let dx = -4; dx <= 4; dx++) {
      f.simulation.grid.set(cx + dx, cy + 2, wallId & 0xfff);
    }
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 1; dy++) {
        f.simulation.grid.set(cx + dx, cy + dy, lavaId & 0xfff);
        f.simulation.field.set(cx + dx, cy + dy, autoTemp);
      }
    }
    return { autoTemp, lavaTemp: f.simulation.field.get(cx, cy) };
  });

  expect(sandwichedTemp.autoTemp).toBe(110);
  expect(sandwichedTemp.lavaTemp).toBe(110);
});
