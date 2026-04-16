import { test, expect } from '@playwright/test';

/**
 * An explosion must do more than replace cells in the crater — its
 * shockwave should push movable matter (sand, liquid, debris) radially
 * outward. This test seeds a sand wall next to a nitro charge, ignites
 * the charge, and checks that the sand was displaced.
 */
test('nitro shockwave displaces sand beyond the crater', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { flux?: unknown }).flux, {
    timeout: 15_000,
  });

  const samples = await page.evaluate(() => {
    const f = (window as unknown as {
      flux: {
        paintDot: (k: string, x: number, y: number) => void;
        simulation: {
          grid: { width: number; height: number; get: (x: number, y: number) => number };
          field: { set: (x: number, y: number, t: number) => void };
          pressure: { get: (x: number, y: number) => number };
          step: () => void;
        };
        getIdByKey: (k: string) => number;
        store: { getState: () => { paused: boolean; togglePause: () => void } };
      };
    }).flux;
    // Pause so we can drive the sim one tick at a time.
    if (!f.store.getState().paused) f.store.getState().togglePause();

    const sandId = f.getIdByKey('sand');
    const sand = (x: number, y: number) => {
      f.paintDot('sand', x, y);
      // paintDot sets field temp; make sure it's room-temp, not hot.
      f.simulation.field.set(x, y, 20);
    };

    const cx = 80;
    const cy = 80;
    // Sand wall 12 cells right of centre — safely outside the crater
    // radius (nitro is r=14 but much of that is the fireball zone).
    for (let dy = -10; dy <= 10; dy++) sand(cx + 16, cy + dy);
    // Put a nitro seed at centre, heated above its 220° ignition threshold.
    f.paintDot('nitro', cx, cy);
    f.simulation.field.set(cx, cy, 300);

    const beforeWall = f.simulation.grid.get(cx + 16, cy) & 0xfff;
    const beforeFar = f.simulation.grid.get(cx + 32, cy) & 0xfff;

    // Step enough ticks for the explosion to fire and the shockwave to
    // cross the 16-cell gap.
    let peakPressure = 0;
    for (let t = 0; t < 24; t++) {
      f.simulation.step();
      const p = Math.abs(f.simulation.pressure.get(cx + 8, cy));
      if (p > peakPressure) peakPressure = p;
    }

    const afterWall = f.simulation.grid.get(cx + 16, cy) & 0xfff;
    const afterFar = f.simulation.grid.get(cx + 32, cy) & 0xfff;

    return {
      sandId,
      beforeWall,
      beforeFar,
      afterWall,
      afterFar,
      peakPressure,
    };
  });

  console.log('Shockwave readout:', samples);
  // The explosion actually happened — the pressure field spiked hard.
  expect(samples.peakPressure).toBeGreaterThan(400);
  // Sand ring survived but got disturbed (either consumed or pushed).
  expect(samples.beforeWall).toBe(samples.sandId);
  // Post-blast, the ring cell is empty or shifted — it did NOT remain
  // untouched sand. Before shockwave support this value would still be sand.
  expect(samples.afterWall).not.toBe(samples.sandId);
});
