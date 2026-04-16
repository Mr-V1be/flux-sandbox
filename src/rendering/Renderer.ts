import { Grid } from '@/core/Grid';
import { TemperatureField } from '@/core/TemperatureField';
import { getLife, getVariant } from '@/core/types';
import { registryArray } from '@/elements/registry';
import { Camera } from './Camera';
import { VisualLookups } from './VisualLookups';
import { HeatMode } from '@/state/Store';

// ─── heat-map palette ──────────────────────────────────────────────────
// Inferno-style ramp precomputed once at module load into a 256×3 byte
// array. Key colour stops chosen to read like a thermal imaging camera:
// near-black ambient → deep purple cold → magenta mid → amber / white hot.
const HEATMAP_STOPS: Array<[number, number, number, number]> = [
  [0.00, 4, 0, 12],
  [0.12, 20, 4, 50],
  [0.24, 60, 14, 100],
  [0.36, 120, 28, 120],
  [0.48, 190, 50, 110],
  [0.58, 230, 80, 70],
  [0.68, 250, 130, 40],
  [0.78, 255, 180, 40],
  [0.88, 255, 220, 120],
  [1.00, 252, 252, 240],
];

const HEATMAP_LUT = (() => {
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let a = HEATMAP_STOPS[0]!;
    let b = HEATMAP_STOPS[HEATMAP_STOPS.length - 1]!;
    for (let s = 0; s < HEATMAP_STOPS.length - 1; s++) {
      if (t >= HEATMAP_STOPS[s]![0] && t <= HEATMAP_STOPS[s + 1]![0]) {
        a = HEATMAP_STOPS[s]!;
        b = HEATMAP_STOPS[s + 1]!;
        break;
      }
    }
    const span = b[0] - a[0];
    const k = span > 0 ? (t - a[0]) / span : 0;
    lut[i * 3 + 0] = Math.round(a[1] + (b[1] - a[1]) * k);
    lut[i * 3 + 1] = Math.round(a[2] + (b[2] - a[2]) * k);
    lut[i * 3 + 2] = Math.round(a[3] + (b[3] - a[3]) * k);
  }
  return lut;
})();

/**
 * Screen renderer.
 *
 * Pipeline per frame:
 *   1. Per-cell pass — writes both the grid colour buffer and the bloom
 *      buffer simultaneously (single iteration over 160k cells).
 *   2. Grid blit — `putImageData` → `drawImage` through the camera.
 *   3. Bloom composite — if any hot cell wrote to the bloom buffer,
 *      blur-and-lighter it on top of the grid (Canvas2D filter is
 *      GPU-accelerated on modern browsers).
 *   4. Overlay hook — caller draws particles / brush cursor here.
 *   5. Post-process — flash decay + vignette.
 *
 * The renderer never knows about the simulation order; it only reads the
 * grid, the temperature field, and the per-cell element definition.
 */
export class Renderer {
  private readonly buffer: ImageData;
  private readonly bufferCanvas: HTMLCanvasElement;
  private readonly bufferCtx: CanvasRenderingContext2D;
  private readonly bloomBuffer: ImageData;
  private readonly bloomCanvas: HTMLCanvasElement;
  private readonly bloomCtx: CanvasRenderingContext2D;
  private readonly ctx: CanvasRenderingContext2D;
  private flashIntensity = 0;
  public heatMode: HeatMode = 'off';

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly grid: Grid,
    private readonly field: TemperatureField,
    private readonly camera: Camera,
    private readonly visualLookups: VisualLookups,
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

    this.bloomCanvas = document.createElement('canvas');
    this.bloomCanvas.width = grid.width;
    this.bloomCanvas.height = grid.height;
    const blctx = this.bloomCanvas.getContext('2d', { alpha: true });
    if (!blctx) throw new Error('2d bloom context unavailable');
    this.bloomCtx = blctx;
    this.bloomBuffer = this.bloomCtx.createImageData(grid.width, grid.height);
  }

  /** Exposed so overlays (particles, brush cursor) can draw on the same ctx. */
  get context(): CanvasRenderingContext2D {
    return this.ctx;
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

  /** Fire off an explosion-white flash; decays over the next ~12 frames. */
  kickFlash(intensity: number): void {
    const capped = Math.min(1, Math.max(0, intensity));
    if (capped > this.flashIntensity) this.flashIntensity = capped;
  }

  /**
   * Render the grid + bloom composite.
   * Call this first, then draw overlays, then `renderPostProcess()`.
   */
  renderGrid(shakeX = 0, shakeY = 0): void {
    const { grid, buffer, bloomBuffer, field, heatMode, visualLookups } = this;
    const data = buffer.data;
    const bloomData = bloomBuffer.data;
    const cells = grid.cells;
    const temps = field.temps;
    const n = cells.length;
    const registry = registryArray();
    const bloomLookup = visualLookups.bloom;
    const copperId = visualLookups.copperId;
    const ironId = visualLookups.ironId;

    const tintMode = heatMode === 'tint';
    const heatmapMode = heatMode === 'heatmap';

    let hasBloom = false;

    for (let i = 0; i < n; i++) {
      const cell = cells[i];
      const id = cell & 0xfff;
      const p = i * 4;

      // ── HEATMAP MODE — dominant palette, hides the material. ─────────
      // Cheapest path: directly look up LUT by temperature byte.
      if (heatmapMode) {
        const t = temps[i];
        const lutIdx = (t + 128) * 3;
        data[p] = HEATMAP_LUT[lutIdx];
        data[p + 1] = HEATMAP_LUT[lutIdx + 1];
        data[p + 2] = HEATMAP_LUT[lutIdx + 2];
        data[p + 3] = 255;
        // Preserve bloom for hot cells so lava/fire still glow in heatmap view.
        if (id !== 0) {
          const life = getLife(cell);
          let bAmt = bloomLookup[id];
          if (life > 0 && (id === copperId || id === ironId)) {
            const live = Math.min(1, life / 28);
            if (live > bAmt) bAmt = live;
          }
          if (bAmt > 0) {
            bloomData[p] = (data[p] * bAmt) | 0;
            bloomData[p + 1] = (data[p + 1] * bAmt) | 0;
            bloomData[p + 2] = (data[p + 2] * bAmt) | 0;
            bloomData[p + 3] = Math.min(255, (bAmt * 255) | 0);
            hasBloom = true;
            continue;
          }
        }
        bloomData[p] = 0;
        bloomData[p + 1] = 0;
        bloomData[p + 2] = 0;
        bloomData[p + 3] = 0;
        continue;
      }

      // ── NORMAL / TINT MODE ───────────────────────────────────────────
      if (id === 0) {
        let r = 10;
        let g = 10;
        let b = 11;
        if (tintMode) {
          const t = temps[i];
          if (t > 3 || t < -3) {
            const tint = tempTint(t);
            r = clamp255(r * (1 - tint.a) + tint.r * tint.a);
            g = clamp255(g * (1 - tint.a) + tint.g * tint.a);
            b = clamp255(b * (1 - tint.a) + tint.b * tint.a);
          }
        }
        data[p] = r;
        data[p + 1] = g;
        data[p + 2] = b;
        data[p + 3] = 255;
        bloomData[p] = 0;
        bloomData[p + 1] = 0;
        bloomData[p + 2] = 0;
        bloomData[p + 3] = 0;
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

      if (tintMode) {
        const t = temps[i];
        if (t > 3 || t < -3) {
          const tint = tempTint(t);
          r = clamp255(r * (1 - tint.a) + tint.r * tint.a);
          g = clamp255(g * (1 - tint.a) + tint.g * tint.a);
          b = clamp255(b * (1 - tint.a) + tint.b * tint.a);
        }
      }

      data[p] = r;
      data[p + 1] = g;
      data[p + 2] = b;
      data[p + 3] = 255;

      let bAmt = bloomLookup[id];
      if (life > 0 && (id === copperId || id === ironId)) {
        const live = Math.min(1, life / 28);
        if (live > bAmt) bAmt = live;
      }

      if (bAmt > 0) {
        bloomData[p] = (r * bAmt) | 0;
        bloomData[p + 1] = (g * bAmt) | 0;
        bloomData[p + 2] = (b * bAmt) | 0;
        bloomData[p + 3] = Math.min(255, (bAmt * 255) | 0);
        hasBloom = true;
      } else {
        bloomData[p] = 0;
        bloomData[p + 1] = 0;
        bloomData[p + 2] = 0;
        bloomData[p + 3] = 0;
      }
    }

    this.bufferCtx.putImageData(buffer, 0, 0);

    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.filter = 'none';
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#050506';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const { offsetX, offsetY, zoom } = this.camera;
    ctx.drawImage(
      this.bufferCanvas,
      0, 0, grid.width, grid.height,
      offsetX + shakeX, offsetY + shakeY,
      grid.width * zoom, grid.height * zoom,
    );

    if (hasBloom) {
      this.bloomCtx.putImageData(bloomBuffer, 0, 0);
      // Blur radius roughly tracks zoom so the glow reads as "~1.5 cells wide".
      const blurPx = Math.max(4, Math.min(22, zoom * 1.5));
      ctx.globalCompositeOperation = 'lighter';
      ctx.filter = `blur(${blurPx.toFixed(2)}px)`;
      ctx.drawImage(
        this.bloomCanvas,
        0, 0, grid.width, grid.height,
        offsetX + shakeX, offsetY + shakeY,
        grid.width * zoom, grid.height * zoom,
      );
      // Double-draw with tighter blur for a crisp core.
      ctx.filter = `blur(${Math.max(1.5, blurPx * 0.35).toFixed(2)}px)`;
      ctx.drawImage(
        this.bloomCanvas,
        0, 0, grid.width, grid.height,
        offsetX + shakeX, offsetY + shakeY,
        grid.width * zoom, grid.height * zoom,
      );
      ctx.filter = 'none';
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  /** Apply flash + vignette on top of everything (call after overlays). */
  renderPostProcess(): void {
    const ctx = this.ctx;
    const cw = this.canvas.width;
    const ch = this.canvas.height;

    if (this.flashIntensity > 0) {
      ctx.fillStyle = `rgba(255,240,220,${this.flashIntensity.toFixed(3)})`;
      ctx.fillRect(0, 0, cw, ch);
      this.flashIntensity = Math.max(0, this.flashIntensity - 0.08);
    }

    // Soft vignette — cheap once per frame.
    const cx = cw / 2;
    const cy = ch / 2;
    const inner = Math.min(cw, ch) * 0.28;
    const outer = Math.max(cw, ch) * 0.78;
    const grd = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, cw, ch);
  }

  /** @deprecated use renderGrid + renderPostProcess. Kept for back-compat. */
  render(shakeX = 0, shakeY = 0): void {
    this.renderGrid(shakeX, shakeY);
    this.renderPostProcess();
  }
}

const clamp255 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

/**
 * Smoother temperature tint using an eased ramp.
 * Cold → pale blue, warm → amber, hot → red-orange, very hot → white-hot.
 */
const tempTint = (t: number): { r: number; g: number; b: number; a: number } => {
  if (t >= 10) {
    const n = Math.min(1, (t - 10) / 110);
    // lerp: amber (255, 180, 20) → red-orange (255, 70, 10) → near-white core (255, 230, 200)
    let r = 255;
    let g = Math.round(180 * (1 - n) + 230 * Math.pow(n, 2));
    let b = Math.round(20 * (1 - n) + 200 * Math.pow(n, 3));
    // Pull back toward amber for mid values
    if (n < 0.7) {
      g = Math.round(180 - n * 110);
      b = Math.round(20 - n * 10);
    }
    const a = 0.15 + Math.pow(n, 0.6) * 0.5;
    return { r, g, b, a };
  }
  if (t <= -10) {
    const n = Math.min(1, Math.abs(t + 10) / 100);
    const r = Math.round(140 - n * 50);
    const g = Math.round(180 - n * 30);
    const b = Math.round(255);
    const a = 0.15 + Math.pow(n, 0.6) * 0.55;
    return { r, g, b, a };
  }
  return { r: 0, g: 0, b: 0, a: 0 };
};
