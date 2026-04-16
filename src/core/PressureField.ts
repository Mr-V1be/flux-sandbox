import { Grid } from './Grid';
import { ElementDefinition, isUpdated, withUpdated } from './types';

/**
 * Per-cell pressure field (Pa-like, arbitrary game scale).
 *
 *   0      atmospheric (default)
 *   +100   mild overpressure
 *   +1500  serious blast — starts pushing movable cells radially
 *   +10000 nuclear spike
 *   −500   mild vacuum (suction)
 *
 * Sources:
 *   - explosion pulses (via `pulse(x, y, radius, peak)`)
 *   - nothing else for v1 (steam / hot gas emission can come later)
 *
 * Evolution per tick:
 *   1. Laplacian diffusion through 4-neighbours, gated by material
 *      permeability so walls actually contain pressure.
 *   2. Uniform decay toward 0 — scenes quiet down on their own.
 *
 * Effect on matter:
 *   `advect(grid)` — for each movable cell with a strong gradient,
 *   swap it with the lowest-pressure neighbour along the gradient.
 *   This is what makes the shockwave visually push sand / liquid /
 *   debris outward from a blast.
 */

/** Pressure bounds (fits comfortably in Int16). */
export const PRESSURE_MAX = 10000;
export const PRESSURE_MIN = -PRESSURE_MAX;

/** Below this, a cell is considered quiet — advection skips it. */
const ADVECT_THRESHOLD = 180;
/** How fast pressure spreads through fully permeable space (0..0.25). */
const DIFFUSE_K = 0.18;
/** Per-tick decay — scenes settle without a steady source. */
const DECAY = 0.985;

const clampP = (v: number): number =>
  v < PRESSURE_MIN ? PRESSURE_MIN : v > PRESSURE_MAX ? PRESSURE_MAX : v | 0;

export class PressureField {
  public readonly pressure: Int16Array;
  private readonly buffer: Int32Array;
  private readonly permeability: Float32Array;

  constructor(
    public readonly width: number,
    public readonly height: number,
    registry: readonly ElementDefinition[],
  ) {
    const size = width * height;
    this.pressure = new Int16Array(size);
    this.buffer = new Int32Array(size);
    this.permeability = new Float32Array(registry.length);
    for (let i = 0; i < registry.length; i++) {
      const def = registry[i];
      this.permeability[i] = def ? permForDef(def) : 0;
    }
  }

  index(x: number, y: number): number {
    return y * this.width + x;
  }

  get(x: number, y: number): number {
    return this.pressure[this.index(x, y)];
  }

  set(x: number, y: number, p: number): void {
    this.pressure[this.index(x, y)] = clampP(p);
  }

  add(x: number, y: number, dp: number): void {
    const idx = this.index(x, y);
    this.pressure[idx] = clampP(this.pressure[idx] + dp);
  }

  clear(): void {
    this.pressure.fill(0);
    this.buffer.fill(0);
  }

  /** Inject a Gaussian pressure pulse at (cx, cy). */
  pulse(cx: number, cy: number, radius: number, peak: number): void {
    const r2 = radius * radius;
    // Gaussian σ ≈ radius/2 so ~86 % of the energy is inside `radius`.
    const invDen = 1 / (2 * Math.max(1, radius * radius * 0.25));
    const xs = Math.max(0, cx - radius);
    const xe = Math.min(this.width - 1, cx + radius);
    const ys = Math.max(0, cy - radius);
    const ye = Math.min(this.height - 1, cy + radius);
    for (let y = ys; y <= ye; y++) {
      for (let x = xs; x <= xe; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const amp = peak * Math.exp(-d2 * invDen);
        const idx = this.index(x, y);
        this.pressure[idx] = clampP(this.pressure[idx] + amp);
      }
    }
  }

  /**
   * Laplacian diffusion + uniform decay, restricted to active chunks.
   * Any chunk that still holds noticeable pressure stays awake next tick.
   */
  diffuse(grid: Grid): void {
    const { width, pressure, buffer, permeability } = this;
    const { chunkSize, chunksX, chunksY } = grid;
    const cells = grid.cells;

    buffer.set(pressure);

    for (let cy = 0; cy < chunksY; cy++) {
      for (let cx = 0; cx < chunksX; cx++) {
        if (!grid.isChunkActive(cx, cy)) continue;
        const x0 = cx * chunkSize;
        const y0 = cy * chunkSize;
        const x1 = Math.min(x0 + chunkSize, width);
        const y1 = Math.min(y0 + chunkSize, this.height);

        for (let y = y0; y < y1; y++) {
          const row = y * width;
          for (let x = x0; x < x1; x++) {
            const idx = row + x;
            const p = pressure[idx];
            const id = cells[idx] & 0xfff;
            const permSelf = permeability[id];

            if (permSelf <= 0 && p === 0) {
              buffer[idx] = 0;
              continue;
            }

            let sum = 0;
            if (x > 0) {
              const n = idx - 1;
              const k = Math.min(permSelf, permeability[cells[n] & 0xfff]);
              sum += k * (pressure[n] - p);
            }
            if (x < width - 1) {
              const n = idx + 1;
              const k = Math.min(permSelf, permeability[cells[n] & 0xfff]);
              sum += k * (pressure[n] - p);
            }
            if (y > 0) {
              const n = idx - width;
              const k = Math.min(permSelf, permeability[cells[n] & 0xfff]);
              sum += k * (pressure[n] - p);
            }
            if (y < this.height - 1) {
              const n = idx + width;
              const k = Math.min(permSelf, permeability[cells[n] & 0xfff]);
              sum += k * (pressure[n] - p);
            }

            const newP = (p + sum * DIFFUSE_K) * DECAY;
            const clamped = clampP(newP);
            buffer[idx] = clamped;
            if (clamped > 24 || clamped < -24) grid.wake(x, y);
          }
        }
      }
    }

    pressure.set(buffer);
  }

  /**
   * Shockwave push: for each movable cell holding meaningful pressure,
   * swap it with the lowest-pressure movable neighbour along the
   * gradient and mark both as `updated` so the behaviour loop leaves
   * them alone this tick.
   */
  advect(grid: Grid): void {
    const { width, pressure, permeability } = this;
    const { chunkSize, chunksX, chunksY, height } = grid;
    const cells = grid.cells;

    for (let cy = 0; cy < chunksY; cy++) {
      for (let cx = 0; cx < chunksX; cx++) {
        if (!grid.isChunkActive(cx, cy)) continue;
        const x0 = cx * chunkSize;
        const y0 = cy * chunkSize;
        const x1 = Math.min(x0 + chunkSize, width);
        const y1 = Math.min(y0 + chunkSize, height);

        for (let y = y0; y < y1; y++) {
          const row = y * width;
          for (let x = x0; x < x1; x++) {
            const idx = row + x;
            const cell = cells[idx];
            if (isUpdated(cell)) continue;
            const id = cell & 0xfff;
            const perm = permeability[id];
            if (perm < 0.18) continue;

            const p = pressure[idx];
            const absP = p < 0 ? -p : p;
            if (absP < ADVECT_THRESHOLD) continue;

            // Find the neighbour that gives the steepest downhill move.
            let bestDelta = ADVECT_THRESHOLD;
            let bestNx = -1;
            let bestNy = -1;
            let bestNidx = -1;

            if (x > 0) {
              const n = idx - 1;
              const nperm = permeability[cells[n] & 0xfff];
              if (nperm >= 0.35) {
                const d = p - pressure[n];
                if (d > bestDelta) {
                  bestDelta = d;
                  bestNx = x - 1;
                  bestNy = y;
                  bestNidx = n;
                }
              }
            }
            if (x < width - 1) {
              const n = idx + 1;
              const nperm = permeability[cells[n] & 0xfff];
              if (nperm >= 0.35) {
                const d = p - pressure[n];
                if (d > bestDelta) {
                  bestDelta = d;
                  bestNx = x + 1;
                  bestNy = y;
                  bestNidx = n;
                }
              }
            }
            if (y > 0) {
              const n = idx - width;
              const nperm = permeability[cells[n] & 0xfff];
              if (nperm >= 0.35) {
                const d = p - pressure[n];
                if (d > bestDelta) {
                  bestDelta = d;
                  bestNx = x;
                  bestNy = y - 1;
                  bestNidx = n;
                }
              }
            }
            if (y < height - 1) {
              const n = idx + width;
              const nperm = permeability[cells[n] & 0xfff];
              if (nperm >= 0.35) {
                const d = p - pressure[n];
                if (d > bestDelta) {
                  bestDelta = d;
                  bestNx = x;
                  bestNy = y + 1;
                  bestNidx = n;
                }
              }
            }

            if (bestNidx < 0) continue;

            // Swap the cell with its downhill neighbour and equalise the
            // pressure by half so the wave dissipates as it advects.
            grid.swap(x, y, bestNx, bestNy);
            const share = (bestDelta * 0.5) | 0;
            pressure[idx] = clampP(p - share);
            pressure[bestNidx] = clampP(pressure[bestNidx] + share);
            cells[idx] = withUpdated(cells[idx], true);
            cells[bestNidx] = withUpdated(cells[bestNidx], true);
          }
        }
      }
    }
  }
}

/**
 * Material permeability (0 = airtight, 1 = nothing resists flow).
 *
 * Derived from category with a handful of hand-tuned exceptions so
 * gameplay-interesting materials (walls, glass, dense metal) actually
 * hold pressure.
 */
const permForDef = (def: ElementDefinition): number => {
  if (def.key === 'wall') return 0.0;
  switch (def.category) {
    case 'empty':
      return 1.0;
    case 'gas':
      return 0.9;
    case 'liquid':
      return 0.38;
    case 'powder':
      return 0.22;
    case 'special':
      return 0.75;
    case 'solid':
      if (def.key === 'glass' || def.key === 'diamond' || def.key === 'obsidian') return 0.02;
      if (def.key === 'stone' || def.key === 'copper' || def.key === 'iron') return 0.04;
      if (def.key === 'wood' || def.key === 'rubber') return 0.06;
      return 0.05;
    default:
      return 0.1;
  }
};
