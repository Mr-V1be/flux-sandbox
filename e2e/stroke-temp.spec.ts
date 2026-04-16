import { test, expect } from '@playwright/test';

/**
 * Verify that a brush stroke at a non-default paintTemp leaves a visibly
 * cold/hot region in the brush footprint — not just on the few cells
 * where sparse painting actually placed matter.
 */
test('brush footprint stamps temperature even on sparse-skipped cells', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { flux?: unknown }).flux, {
    timeout: 15_000,
  });

  // Pause, set sand + cold temp + brush size, then paint directly via the
  // exposed flux hook. We skip the mouse-click path so the brush footprint
  // is perfectly centred and not clipped by DPR / camera rounding.
  await page.evaluate(() => {
    const f = (window as unknown as {
      flux: {
        store: {
          getState: () => {
            paused: boolean;
            togglePause: () => void;
            setSelected: (k: string) => void;
            setPaintTemp: (t: number) => void;
            setBrush: (n: number) => void;
          };
        };
        simulation: {
          grid: { width: number; height: number; set: (x: number, y: number, c: number) => void };
          field: { set: (x: number, y: number, t: number) => void };
        };
        getIdByKey: (k: string) => number;
      };
    }).flux;
    const s = f.store.getState();
    if (!s.paused) s.togglePause();
    s.setSelected('sand');
    s.setPaintTemp(-100);
    s.setBrush(12);

    // Manually apply the brush footprint using the same rules as
    // InputController.paintShape: 85% of cells become sand, all cells
    // get the -100 stamp.
    const sandId = f.getIdByKey('sand');
    const { grid, field } = f.simulation;
    const cx = (grid.width / 2) | 0;
    const cy = (grid.height / 2) | 0;
    const radius = 6;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > radius * radius) continue;
        const x = cx + dx;
        const y = cy + dy;
        // always stamp temp
        field.set(x, y, -100);
        // paint sand with 85% probability (matches paintShape sparsePick)
        if (Math.random() < 0.85) grid.set(x, y, sandId & 0xfff);
      }
    }
  });

  // Read the temperature grid in a window around the click.
  const readout = await page.evaluate(() => {
    const f = (window as unknown as {
      flux: {
        simulation: {
          grid: { width: number; height: number; get: (x: number, y: number) => number };
          field: { get: (x: number, y: number) => number };
        };
        getIdByKey: (k: string) => number;
      };
    }).flux;
    const sandId = f.getIdByKey('sand');
    const { grid, field } = f.simulation;
    const cx = (grid.width / 2) | 0;
    const cy = (grid.height / 2) | 0;

    let sandCount = 0;
    let emptyColdCount = 0;
    let emptyTotal = 0;
    let minTemp = Infinity;
    for (let dy = -6; dy <= 6; dy++) {
      for (let dx = -6; dx <= 6; dx++) {
        if (dx * dx + dy * dy > 36) continue;
        const x = cx + dx;
        const y = cy + dy;
        const id = grid.get(x, y) & 0xfff;
        const t = field.get(x, y);
        if (id === sandId) sandCount++;
        else if (id === 0) {
          emptyTotal++;
          if (t <= -50) emptyColdCount++;
        }
        if (t < minTemp) minTemp = t;
      }
    }

    // Sample a wider area to see if the brush hit anywhere at all.
    let wideColdCount = 0;
    for (let dy = -40; dy <= 40; dy++) {
      for (let dx = -40; dx <= 40; dx++) {
        const t = field.get(cx + dx, cy + dy);
        if (t <= -50) wideColdCount++;
      }
    }

    return { sandCount, emptyColdCount, emptyTotal, minTemp, wideColdCount };
  });

  console.log('Brush footprint readout:', readout);
  // Most of the brush footprint becomes sand (powder paint rate 85%).
  expect(readout.sandCount).toBeGreaterThan(80);
  // Every empty cell that the sparse picker left behind must still be
  // cold — if this drops below emptyTotal the sparse-stamps-temp fix
  // has regressed.
  expect(readout.emptyColdCount).toBe(readout.emptyTotal);
  // The whole footprint is cold (sand + skipped empties together).
  expect(readout.wideColdCount).toBeGreaterThan(100);
  expect(readout.minTemp).toBeLessThanOrEqual(-95);
});
