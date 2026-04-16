import { test } from '@playwright/test';

/**
 * Diagnostic probe — drops a burst of cold sand and reports what happens
 * to both the sand and the surrounding air over time. Lets us verify the
 * swap-temp fix from the console and understand whether paint-temperature
 * bleeds into ambient as the user expects.
 */
test('cold sand thermal trail — diagnostic', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { flux?: unknown }).flux, {
    timeout: 15_000,
  });

  // Pause the sim so we can make a clean initial snapshot.
  await page.evaluate(() => {
    const s = (window as unknown as {
      flux: { store: { getState: () => { paused: boolean; togglePause: () => void } } };
    }).flux.store;
    if (!s.getState().paused) s.getState().togglePause();
  });

  // Spawn a single cold sand cell floating at the top of a column of air.
  const initial = await page.evaluate(() => {
    const f = (window as unknown as {
      flux: {
        simulation: {
          grid: {
            width: number;
            height: number;
            set: (x: number, y: number, c: number) => void;
          };
          field: {
            set: (x: number, y: number, t: number) => void;
            get: (x: number, y: number) => number;
          };
        };
        getIdByKey: (k: string) => number;
      };
    }).flux;
    const sandId = f.getIdByKey('sand');
    const { grid, field } = f.simulation;
    const cx = (grid.width / 2) | 0;
    const startY = 10;

    // One cold sand cell + its temperature.
    grid.set(cx, startY, sandId & 0xfff);
    field.set(cx, startY, -100);

    return {
      cx,
      startY,
      sandTemp: field.get(cx, startY),
      airAbove: field.get(cx, startY - 1),
      airLeft: field.get(cx - 1, startY),
      airBelow: field.get(cx, startY + 1),
    };
  });

  console.log('t=0 (paint tick):', initial);

  // Un-pause and let it fall for a tick count.
  const samples: Array<Record<string, number>> = [];
  for (const waitMs of [50, 200, 600, 1500, 3000]) {
    await page.evaluate(() => {
      const s = (window as unknown as {
        flux: { store: { getState: () => { paused: boolean; togglePause: () => void } } };
      }).flux.store;
      if (s.getState().paused) s.getState().togglePause();
    });
    await page.waitForTimeout(waitMs);

    const snapshot = await page.evaluate(({ cx, startY }) => {
      const f = (window as unknown as {
        flux: {
          simulation: {
            grid: {
              width: number;
              height: number;
              get: (x: number, y: number) => number;
            };
            field: { get: (x: number, y: number) => number };
          };
          getIdByKey: (k: string) => number;
        };
      }).flux;
      const sandId = f.getIdByKey('sand');
      const { grid, field } = f.simulation;

      // Scan the vertical column below startY for sand and report its temp.
      let sandY = -1;
      let sandTemp = 0;
      for (let y = startY; y < grid.height; y++) {
        if ((grid.get(cx, y) & 0xfff) === sandId) {
          sandY = y;
          sandTemp = field.get(cx, y);
          break;
        }
      }
      // "Trail" probe — air at the spawn cell (sand has moved away by now).
      const trailTemp = field.get(cx, startY);
      // "Side" probe — air one cell to the right of the current sand.
      const sideTemp = sandY >= 0 ? field.get(cx + 1, sandY) : 0;
      // Far-away air.
      const farTemp = field.get(cx + 30, startY);
      return { sandY, sandTemp, trailTemp, sideTemp, farTemp };
    }, initial);

    samples.push({ waitMs, ...snapshot });
  }

  console.log('Thermal trail timeline:');
  console.table(samples);
});

test('slider change alone should NOT instantly change existing air', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { flux?: unknown }).flux, {
    timeout: 15_000,
  });

  const before = await page.evaluate(() => {
    const f = (window as unknown as {
      flux: {
        simulation: { field: { get: (x: number, y: number) => number } };
        store: { setState: (s: Partial<{ paintTemp: number }>) => void };
      };
    }).flux;
    return f.simulation.field.get(100, 100);
  });

  // Move the slider programmatically — but don't paint.
  await page.evaluate(() => {
    const s = (window as unknown as {
      flux: {
        store: {
          getState: () => { setPaintTemp: (t: number) => void };
        };
      };
    }).flux.store;
    s.getState().setPaintTemp(-100);
  });

  await page.waitForTimeout(500);

  const after = await page.evaluate(() => {
    const f = (window as unknown as {
      flux: { simulation: { field: { get: (x: number, y: number) => number } } };
    }).flux;
    return f.simulation.field.get(100, 100);
  });

  console.log(`Air at (100,100) before slider change: ${before}°, after: ${after}°`);
});
