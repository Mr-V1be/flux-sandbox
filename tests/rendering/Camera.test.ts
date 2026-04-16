import { describe, it, expect, beforeAll } from 'vitest';
import { Camera } from '@/rendering/Camera';

beforeAll(() => {
  // Camera reads `window.devicePixelRatio` inside `fit` / `clampToView`;
  // make sure a value exists in the Node test environment.
  Object.defineProperty(globalThis, 'window', {
    value: { devicePixelRatio: 1 },
    configurable: true,
  });
});

describe('Camera', () => {
  it('fit() zooms the grid inside the canvas with padding', () => {
    const cam = new Camera(100, 100);
    cam.fit(800, 400, 24);
    // zoom should fit height (400 - 48) / 100 = 3.52 smaller dim
    expect(cam.zoom).toBeGreaterThan(0);
    expect(cam.zoom).toBeLessThanOrEqual(32);
  });

  it('screenToWorld and worldToScreen are inverses', () => {
    const cam = new Camera(100, 100);
    cam.zoom = 4;
    cam.offsetX = 50;
    cam.offsetY = 25;
    for (const [sx, sy] of [
      [0, 0],
      [120, 80],
      [300, 200],
    ]) {
      const w = cam.screenToWorld(sx, sy);
      const back = cam.worldToScreen(w.x, w.y);
      expect(back.sx).toBeCloseTo(sx, 6);
      expect(back.sy).toBeCloseTo(sy, 6);
    }
  });

  it('zoomAt keeps the world position under the cursor fixed', () => {
    const cam = new Camera(200, 200);
    cam.zoom = 2;
    cam.offsetX = 10;
    cam.offsetY = 20;
    const anchor = { sx: 400, sy: 300 };
    const before = cam.screenToWorld(anchor.sx, anchor.sy);
    cam.zoomAt(anchor.sx, anchor.sy, 1.6);
    const after = cam.screenToWorld(anchor.sx, anchor.sy);
    expect(after.x).toBeCloseTo(before.x, 5);
    expect(after.y).toBeCloseTo(before.y, 5);
  });

  it('zoom is clamped to [minZoom, maxZoom]', () => {
    const cam = new Camera(100, 100);
    cam.zoom = 1;
    cam.zoomAt(0, 0, 1000);
    expect(cam.zoom).toBeLessThanOrEqual(cam.maxZoom);
    cam.zoomAt(0, 0, 0.0001);
    expect(cam.zoom).toBeGreaterThanOrEqual(cam.minZoom);
  });

  it('pan() moves the offset by the given delta', () => {
    const cam = new Camera(100, 100);
    cam.offsetX = 10;
    cam.offsetY = 10;
    cam.pan(5, -3);
    expect(cam.offsetX).toBe(15);
    expect(cam.offsetY).toBe(7);
  });
});
