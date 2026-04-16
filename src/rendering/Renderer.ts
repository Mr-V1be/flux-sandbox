import { Grid } from '@/core/Grid';
import { TemperatureField } from '@/core/TemperatureField';
import { getLife, getVariant } from '@/core/types';
import { registryArray } from '@/elements/registry';
import { Camera } from './Camera';

/**
 * Renderer: responsible only for drawing the grid to a canvas.
 *
 * - paints the logical grid into an off-screen buffer (1 pixel per cell)
 * - blits that buffer to the main canvas via Camera transform
 *   (imageSmoothingEnabled = false keeps pixels crisp at any zoom)
 * - optionally overlays a temperature tint
 */
export class Renderer {
  private readonly buffer: ImageData;
  private readonly bufferCanvas: HTMLCanvasElement;
  private readonly bufferCtx: CanvasRenderingContext2D;
  private readonly ctx: CanvasRenderingContext2D;
  public showTemperature = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly grid: Grid,
    private readonly field: TemperatureField,
    private readonly camera: Camera,
  ) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('2d context unavailable');
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;

    this.bufferCanvas = document.createElement('canvas');
    this.bufferCanvas.width = grid.width;
    this.bufferCanvas.height = grid.height;
    const bctx = this.bufferCanvas.getContext('2d', { alpha: false });
    if (!bctx) throw new Error('2d buffer context unavailable');
    this.bufferCtx = bctx;
    this.buffer = this.bufferCtx.createImageData(grid.width, grid.height);
  }

  resize(cssWidth: number, cssHeight: number): { pixelW: number; pixelH: number } {
    const dpr = window.devicePixelRatio || 1;
    const pixelW = Math.floor(cssWidth * dpr);
    const pixelH = Math.floor(cssHeight * dpr);
    this.canvas.width = pixelW;
    this.canvas.height = pixelH;
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    return { pixelW, pixelH };
  }

  /** Expose the visible ctx so overlays (particles, brush cursor) can draw. */
  get context(): CanvasRenderingContext2D {
    return this.ctx;
  }

  render(shakeX = 0, shakeY = 0): void {
    const { grid, buffer, field, showTemperature } = this;
    const data = buffer.data;
    const cells = grid.cells;
    const temps = field.temps;
    const n = cells.length;
    const registry = registryArray();

    for (let i = 0; i < n; i++) {
      const cell = cells[i];
      const id = cell & 0xfff; // inline getElement
      const p = i * 4;

      // Fast path: empty cells (typically majority of grid).
      if (id === 0) {
        if (showTemperature) {
          const t = temps[i];
          if (t > 3 || t < -3) {
            const { tr, tg, tb, alpha } = tempTint(t);
            data[p] = clamp255(10 * (1 - alpha) + tr * alpha);
            data[p + 1] = clamp255(10 * (1 - alpha) + tg * alpha);
            data[p + 2] = clamp255(11 * (1 - alpha) + tb * alpha);
          } else {
            data[p] = 10;
            data[p + 1] = 10;
            data[p + 2] = 11;
          }
        } else {
          data[p] = 10;
          data[p + 1] = 10;
          data[p + 2] = 11;
        }
        data[p + 3] = 255;
        continue;
      }

      const def = registry[id];
      const life = getLife(cell);
      const variant = getVariant(cell);

      let color = def?.color ?? 0x0a0a0b;
      if (def?.renderColor) {
        const dynamic = def.renderColor(cell, life, variant);
        if (dynamic >= 0) color = dynamic;
      }
      let r = (color >> 16) & 0xff;
      let g = (color >> 8) & 0xff;
      let b = color & 0xff;

      const variance = def?.colorVariance ?? 0;
      if (variance > 0 && !def?.renderColor) {
        const delta = ((variant / 255) * 2 - 1) * variance;
        r = clamp255(r + delta);
        g = clamp255(g + delta);
        b = clamp255(b + delta);
      }

      if (showTemperature) {
        const t = temps[i];
        if (t > 3 || t < -3) {
          const { tr, tg, tb, alpha } = tempTint(t);
          r = clamp255(r * (1 - alpha) + tr * alpha);
          g = clamp255(g * (1 - alpha) + tg * alpha);
          b = clamp255(b * (1 - alpha) + tb * alpha);
        }
      }

      data[p] = r;
      data[p + 1] = g;
      data[p + 2] = b;
      data[p + 3] = 255;
    }

    this.bufferCtx.putImageData(buffer, 0, 0);

    // Clear visible canvas, draw buffer via camera transform.
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.fillStyle = '#050506';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const { offsetX, offsetY, zoom } = this.camera;
    this.ctx.drawImage(
      this.bufferCanvas,
      0, 0, grid.width, grid.height,
      offsetX + shakeX, offsetY + shakeY, grid.width * zoom, grid.height * zoom,
    );
  }
}

const clamp255 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

/**
 * Map a temperature value to a tint color + alpha.
 * Cold → pale blue, warm → amber, hot → red-orange.
 */
const tempTint = (t: number): { tr: number; tg: number; tb: number; alpha: number } => {
  if (t >= 10) {
    // warm → hot ramp: 10 -> faint, 120 -> strong red
    const n = Math.min(1, (t - 10) / 110);
    return { tr: 255, tg: Math.round(180 * (1 - n)), tb: 20, alpha: 0.15 + n * 0.45 };
  }
  if (t <= -10) {
    const n = Math.min(1, Math.abs(t + 10) / 100);
    return { tr: 140, tg: 180, tb: 255, alpha: 0.15 + n * 0.5 };
  }
  return { tr: 0, tg: 0, tb: 0, alpha: 0 };
};
