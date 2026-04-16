import { Grid } from '@/core/Grid';
import { TemperatureField } from '@/core/TemperatureField';
import { PressureField, PRESSURE_MAX, PRESSURE_MIN } from '@/core/PressureField';
import { getLife, getVariant } from '@/core/types';
import { registryArray } from '@/elements/registry';
import { Camera } from './Camera';
import { VisualLookups } from './VisualLookups';
import { HeatMode, LightMode } from '@/state/Store';
import { TEMP_MAX, TEMP_MIN } from '@/core/Lookups';

// ─── heat-map palette ──────────────────────────────────────────────────
// Stops are keyed by absolute °C. Between them the LUT interpolates
// linearly, so real-world milestones land on recognisable colours:
//   -200 → deep navy           (cryo territory)
//      0 → pale blue-white     (water freezes)
//     20 → near-neutral        (room temp / ambient)
//    100 → cream-yellow        (water boils)
//    300 → orange              (wood ignites)
//    800 → red                 (torch / lava glow)
//   1500 → yellow-white        (iron softens)
//   3000 → white-hot
//   5000 → blue-tinted white   (plasma ceiling)
const HEATMAP_STOPS: Array<[number, number, number, number]> = [
  [-273, 4, 6, 18],
  [-200, 8, 14, 72],
  [-100, 30, 62, 168],
  [-40, 90, 170, 230],
  [0, 210, 230, 248],
  [20, 248, 248, 240],
  [60, 255, 240, 200],
  [100, 255, 222, 160],
  [200, 255, 192, 110],
  [400, 255, 140, 60],
  [800, 255, 80, 30],
  [1200, 240, 40, 30],
  [1800, 255, 160, 80],
  [2500, 255, 220, 150],
  [3500, 230, 235, 230],
  [4500, 210, 220, 255],
  [5000, 255, 255, 255],
];

const HEATMAP_LUT_SIZE = 512;
const HEATMAP_LUT_SCALE = (HEATMAP_LUT_SIZE - 1) / (TEMP_MAX - TEMP_MIN);
const HEATMAP_LUT = (() => {
  const lut = new Uint8ClampedArray(HEATMAP_LUT_SIZE * 3);
  for (let i = 0; i < HEATMAP_LUT_SIZE; i++) {
    const t = TEMP_MIN + i / HEATMAP_LUT_SCALE;
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

// ─── pressure palette ──────────────────────────────────────────────────
// Centred at 0 Pa (ambient = neutral grey), with deep blue for vacuum
// and deep red for over-pressure. A dynamic range of ±2000 Pa covers the
// vast majority of interesting play — bigger spikes still saturate at
// those extremes so the eye can instantly read intensity.
const PRESSURE_STOPS: Array<[number, number, number, number]> = [
  [-10000, 10, 20, 110],
  [-2000, 36, 70, 200],
  [-500, 90, 140, 230],
  [-100, 160, 195, 235],
  [0, 200, 200, 210],
  [100, 235, 190, 150],
  [500, 250, 130, 80],
  [2000, 220, 40, 40],
  [10000, 110, 10, 20],
];
const PRESSURE_LUT_SIZE = 512;
const PRESSURE_LUT_SCALE = (PRESSURE_LUT_SIZE - 1) / (PRESSURE_MAX - PRESSURE_MIN);
const PRESSURE_LUT = (() => {
  const lut = new Uint8ClampedArray(PRESSURE_LUT_SIZE * 3);
  for (let i = 0; i < PRESSURE_LUT_SIZE; i++) {
    const t = PRESSURE_MIN + i / PRESSURE_LUT_SCALE;
    let a = PRESSURE_STOPS[0]!;
    let b = PRESSURE_STOPS[PRESSURE_STOPS.length - 1]!;
    for (let s = 0; s < PRESSURE_STOPS.length - 1; s++) {
      if (t >= PRESSURE_STOPS[s]![0] && t <= PRESSURE_STOPS[s + 1]![0]) {
        a = PRESSURE_STOPS[s]!;
        b = PRESSURE_STOPS[s + 1]!;
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
  private readonly lightingBuffer: ImageData;
  private readonly lightingCanvas: HTMLCanvasElement;
  private readonly lightingCtx: CanvasRenderingContext2D;
  private readonly ctx: CanvasRenderingContext2D;
  private flashIntensity = 0;
  public heatMode: HeatMode = 'off';
  public lightMode: LightMode = 'day';

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly grid: Grid,
    private readonly field: TemperatureField,
    private readonly pressure: PressureField,
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

    // Lighting buffer — identical layout to bloom, but drawn with a larger
    // blur so glowing cells cast a wide halo; in dusk/night this illuminates
    // the otherwise-darkened world around each emitter.
    this.lightingCanvas = document.createElement('canvas');
    this.lightingCanvas.width = grid.width;
    this.lightingCanvas.height = grid.height;
    const lctx = this.lightingCanvas.getContext('2d', { alpha: true });
    if (!lctx) throw new Error('2d lighting context unavailable');
    this.lightingCtx = lctx;
    this.lightingBuffer = this.lightingCtx.createImageData(grid.width, grid.height);
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
    const { grid, buffer, bloomBuffer, lightingBuffer, field, heatMode, lightMode, visualLookups } = this;
    const data = buffer.data;
    const bloomData = bloomBuffer.data;
    const lightingData = lightingBuffer.data;
    const lightingOn = lightMode !== 'day';
    const cells = grid.cells;
    const temps = field.temps;
    const n = cells.length;
    const registry = registryArray();
    const bloomLookup = visualLookups.bloom;
    const copperId = visualLookups.copperId;
    const ironId = visualLookups.ironId;

    // Hoist thermal-response arrays into locals for tighter loop access.
    const glowStart = visualLookups.glowStart;
    const glowRange = visualLookups.glowRange;
    const glowStrength = visualLookups.glowStrength;
    const glowR = visualLookups.glowR;
    const glowG = visualLookups.glowG;
    const glowB = visualLookups.glowB;
    const coldStart = visualLookups.coldStart;
    const coldRange = visualLookups.coldRange;
    const coldStrength = visualLookups.coldStrength;
    const coldR = visualLookups.coldR;
    const coldG = visualLookups.coldG;
    const coldB = visualLookups.coldB;

    const tintMode = heatMode === 'tint';
    const heatmapMode = heatMode === 'heatmap';
    const pressureMode = heatMode === 'pressure';
    const pressureData = pressureMode ? this.pressure.pressure : null;

    let hasBloom = false;
    let hasLight = false;

    for (let i = 0; i < n; i++) {
      const cell = cells[i];
      const id = cell & 0xfff;
      const p = i * 4;

      // ── PRESSURE MODE — shockwave camera. ────────────────────────────
      if (pressureMode) {
        const pRaw = pressureData![i];
        let bucket = ((pRaw - PRESSURE_MIN) * PRESSURE_LUT_SCALE) | 0;
        if (bucket < 0) bucket = 0;
        else if (bucket >= PRESSURE_LUT_SIZE) bucket = PRESSURE_LUT_SIZE - 1;
        const lutIdx = bucket * 3;
        data[p] = PRESSURE_LUT[lutIdx];
        data[p + 1] = PRESSURE_LUT[lutIdx + 1];
        data[p + 2] = PRESSURE_LUT[lutIdx + 2];
        data[p + 3] = 255;
        bloomData[p] = 0;
        bloomData[p + 1] = 0;
        bloomData[p + 2] = 0;
        bloomData[p + 3] = 0;
        if (lightingOn) {
          lightingData[p] = 0;
          lightingData[p + 1] = 0;
          lightingData[p + 2] = 0;
          lightingData[p + 3] = 0;
        }
        continue;
      }

      // ── HEATMAP MODE — dominant palette, hides the material. ─────────
      if (heatmapMode) {
        const t = temps[i];
        let bucket = ((t - TEMP_MIN) * HEATMAP_LUT_SCALE) | 0;
        if (bucket < 0) bucket = 0;
        else if (bucket >= HEATMAP_LUT_SIZE) bucket = HEATMAP_LUT_SIZE - 1;
        const lutIdx = bucket * 3;
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
        if (lightingOn) {
          lightingData[p] = 0;
          lightingData[p + 1] = 0;
          lightingData[p + 2] = 0;
          lightingData[p + 3] = 0;
        }
        continue;
      }

      // ── NORMAL / TINT MODE ───────────────────────────────────────────
      if (id === 0) {
        let r = 10;
        let g = 10;
        let b = 11;
        const t = temps[i];
        // Tint mode shows air temperature at full strength; the default
        // (off) mode still hints at thermal gradients with a faint haze
        // so a heated / cooled room is visibly different from empty space.
        const threshold = tintMode ? 15 : 60;
        if (t > threshold || t < -threshold) {
          const tint = tempTint(t);
          const a = tint.a * (tintMode ? 1 : 0.3);
          r = clamp255(r * (1 - a) + tint.r * a);
          g = clamp255(g * (1 - a) + tint.g * a);
          b = clamp255(b * (1 - a) + tint.b * a);
        }
        data[p] = r;
        data[p + 1] = g;
        data[p + 2] = b;
        data[p + 3] = 255;
        bloomData[p] = 0;
        bloomData[p + 1] = 0;
        bloomData[p + 2] = 0;
        bloomData[p + 3] = 0;
        if (lightingOn) {
          lightingData[p] = 0;
          lightingData[p + 1] = 0;
          lightingData[p + 2] = 0;
          lightingData[p + 3] = 0;
        }
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

      // ── Thermal colour response ────────────────────────────────────
      // Hot cells glow additively (black-body-ish), cold cells blend
      // toward a darker / bluer tint. Both happen in normal and tint
      // modes so the material itself shows its temperature.
      const t = temps[i];
      let glowBoost = 0;
      const gRange = glowRange[id];
      if (gRange > 0) {
        const gStart = glowStart[id];
        if (t >= gStart) {
          let norm = (t - gStart) / gRange;
          if (norm > 1.3) norm = 1.3;
          const a = norm * glowStrength[id];
          r = clamp255(r + glowR[id] * a);
          g = clamp255(g + glowG[id] * a);
          b = clamp255(b + glowB[id] * a);
          // Hot metal should visibly radiate — mix into bloom later.
          glowBoost = a * 0.7;
        }
      }
      const cRange = coldRange[id];
      if (cRange > 0) {
        const cStart = coldStart[id];
        if (t <= cStart) {
          let norm = (cStart - t) / cRange;
          if (norm > 1) norm = 1;
          const a = norm * coldStrength[id];
          const inv = 1 - a;
          r = clamp255(r * inv + coldR[id] * a);
          g = clamp255(g * inv + coldG[id] * a);
          b = clamp255(b * inv + coldB[id] * a);
        }
      }

      if (tintMode) {
        if (t > 15 || t < -15) {
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
      if (glowBoost > bAmt) bAmt = glowBoost;

      if (bAmt > 0) {
        bloomData[p] = (r * bAmt) | 0;
        bloomData[p + 1] = (g * bAmt) | 0;
        bloomData[p + 2] = (b * bAmt) | 0;
        bloomData[p + 3] = Math.min(255, (bAmt * 255) | 0);
        hasBloom = true;
        if (lightingOn) {
          // Push the emitter toward full brightness — a weak source stays
          // dim after the wide blur and reads as "nothing". Multi-pass
          // compositing stacks, so a mid-strength emitter still gives a
          // visible halo without torching the frame.
          const la = bAmt >= 0.9 ? 1 : bAmt * 1.5;
          const la2 = la > 1 ? 1 : la;
          lightingData[p] = (r * la2) | 0;
          lightingData[p + 1] = (g * la2) | 0;
          lightingData[p + 2] = (b * la2) | 0;
          lightingData[p + 3] = 255;
          hasLight = true;
        }
      } else {
        bloomData[p] = 0;
        bloomData[p + 1] = 0;
        bloomData[p + 2] = 0;
        bloomData[p + 3] = 0;
        if (lightingOn) {
          lightingData[p] = 0;
          lightingData[p + 1] = 0;
          lightingData[p + 2] = 0;
          lightingData[p + 3] = 0;
        }
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

    // ── LIGHTING PASS ───────────────────────────────────────────────
    // Darken the whole scene by (1 − ambient) then add blurred light from
    // emitters on top — torches / lava / spark / uranium / portals etc.
    // cast wide coloured halos that make the lit material actually useful
    // as illumination, not just decoration. Heatmap mode skips this.
    if (lightingOn && !heatmapMode) {
      const ambient = lightMode === 'night' ? 0.12 : 0.42;
      ctx.globalCompositeOperation = 'multiply';
      const shade = Math.round(ambient * 255);
      ctx.fillStyle = `rgb(${shade}, ${shade}, ${Math.round(ambient * 230)})`;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.globalCompositeOperation = 'source-over';

      if (hasLight) {
        this.lightingCtx.putImageData(lightingBuffer, 0, 0);
        // Three-pass blur (wide halo → mid body → bright core) gives a
        // physically-plausible 1/r² falloff. Reach tracks zoom so a torch
        // bathes ~20 grid cells regardless of how far the camera is.
        const reach = Math.max(60, Math.min(320, zoom * 32));
        ctx.globalCompositeOperation = 'lighter';
        ctx.filter = `blur(${reach.toFixed(2)}px)`;
        ctx.drawImage(
          this.lightingCanvas,
          0, 0, grid.width, grid.height,
          offsetX + shakeX, offsetY + shakeY,
          grid.width * zoom, grid.height * zoom,
        );
        ctx.filter = `blur(${(reach * 0.4).toFixed(2)}px)`;
        ctx.drawImage(
          this.lightingCanvas,
          0, 0, grid.width, grid.height,
          offsetX + shakeX, offsetY + shakeY,
          grid.width * zoom, grid.height * zoom,
        );
        ctx.filter = `blur(${(reach * 0.12).toFixed(2)}px)`;
        ctx.drawImage(
          this.lightingCanvas,
          0, 0, grid.width, grid.height,
          offsetX + shakeX, offsetY + shakeY,
          grid.width * zoom, grid.height * zoom,
        );
        ctx.filter = 'none';
        ctx.globalCompositeOperation = 'source-over';
      }
    }

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
 * Saturates at 1500° on the warm side (white-hot metal) and at −200°
 * on the cold side (liquid-nitrogen territory).
 */
const tempTint = (t: number): { r: number; g: number; b: number; a: number } => {
  if (t >= 20) {
    const n = Math.min(1, (t - 20) / 1480);
    let r = 255;
    let g: number;
    let b: number;
    if (n < 0.5) {
      // amber → red-orange
      const k = n / 0.5;
      g = Math.round(200 - 130 * k);
      b = Math.round(80 - 60 * k);
    } else {
      // red-orange → white-hot
      const k = (n - 0.5) / 0.5;
      g = Math.round(70 + 185 * Math.pow(k, 1.5));
      b = Math.round(20 + 235 * Math.pow(k, 2));
    }
    const a = 0.15 + Math.pow(n, 0.5) * 0.55;
    return { r, g, b, a };
  }
  if (t <= 0) {
    const n = Math.min(1, Math.abs(t) / 200);
    const r = Math.round(150 - n * 90);
    const g = Math.round(200 - n * 60);
    const b = 255;
    const a = 0.15 + Math.pow(n, 0.6) * 0.55;
    return { r, g, b, a };
  }
  return { r: 0, g: 0, b: 0, a: 0 };
};
