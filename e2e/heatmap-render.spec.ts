import { test, expect } from '@playwright/test';

/**
 * Full-stack visual check: drag the ambient slider in heatmap mode and
 * verify the rendered canvas pixel colour changes. Catches bugs in the
 * store → lookup → temps → renderer pipeline that data-only tests miss.
 */
test('heatmap mode: air pixel colour follows ambient temperature', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { flux?: unknown }).flux, {
    timeout: 15_000,
  });

  await page.evaluate(() => {
    const f = (window as unknown as {
      flux: { store: { getState: () => { setHeatMode: (m: string) => void } } };
    }).flux;
    f.store.getState().setHeatMode('heatmap');
  });
  await page.waitForTimeout(150);

  const readPixel = async () =>
    page.evaluate(() => {
      const canvas = document.getElementById('sim') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const px = ctx.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data;
      return { r: px[0], g: px[1], b: px[2] };
    });

  const cold = await readPixel();

  await page.evaluate(() => {
    (window as unknown as {
      flux: { store: { getState: () => { setAmbientTemp: (t: number) => void } } };
    }).flux.store.getState().setAmbientTemp(80);
  });
  await page.waitForTimeout(150);
  const hot = await readPixel();

  await page.evaluate(() => {
    (window as unknown as {
      flux: { store: { getState: () => { setAmbientTemp: (t: number) => void } } };
    }).flux.store.getState().setAmbientTemp(-80);
  });
  await page.waitForTimeout(150);
  const chill = await readPixel();

  const diffHot =
    Math.abs(hot.r - cold.r) + Math.abs(hot.g - cold.g) + Math.abs(hot.b - cold.b);
  const diffChill =
    Math.abs(chill.r - cold.r) + Math.abs(chill.g - cold.g) + Math.abs(chill.b - cold.b);

  expect(diffHot).toBeGreaterThan(80);
  expect(diffChill).toBeGreaterThan(80);
});
