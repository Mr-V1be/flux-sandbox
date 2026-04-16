import { Grid } from './Grid';
import { MAX_DELTA_PER_TICK, ThermalLookups } from './Lookups';
import { getElement } from './types';

/**
 * Temperature field — one signed byte of temperature per cell.
 *
 * Heat equation (forward-Euler, 4-neighbour 2D Laplacian):
 *
 *     T'(x,y) = T(x,y) + Σ_n  k_pair(T, n) · (T_n − T)
 *
 * where `k_pair(a, b)` is a precomputed harmonic mean of each pair's
 * conductivity (series heat transfer), clamped at `MAX_EDGE_K` so the
 * scheme is stable for all 4-neighbour sums. The per-tick delta is
 * additionally clipped at `MAX_DELTA_PER_TICK` to suppress worst-case
 * spikes when a cell is surrounded by very hot neighbours.
 *
 * Heat emitters (lava, torch, ice, cryo, empty=ambient) then pull each
 * emitter cell a fraction `emitStrength` toward its `emitTemp`.
 *
 * Cells flagged as "noticeable" (|T| > 3°) wake their chunk next tick
 * so a heat front can cross chunk boundaries it wasn't active in yet.
 */
export class TemperatureField {
  public readonly temps: Int8Array;
  private readonly buffer: Int16Array;

  constructor(public readonly width: number, public readonly height: number) {
    this.temps = new Int8Array(width * height);
    this.buffer = new Int16Array(width * height);
  }

  index(x: number, y: number): number {
    return y * this.width + x;
  }

  get(x: number, y: number): number {
    return this.temps[this.index(x, y)];
  }

  set(x: number, y: number, t: number): void {
    const v = t < -128 ? -128 : t > 127 ? 127 : t | 0;
    this.temps[this.index(x, y)] = v;
  }

  add(x: number, y: number, delta: number): void {
    const idx = this.index(x, y);
    const v = this.temps[idx] + delta;
    this.temps[idx] = v < -128 ? -128 : v > 127 ? 127 : v | 0;
  }

  clear(): void {
    this.temps.fill(0);
    this.buffer.fill(0);
  }

  /** Single-pass physical diffusion + emitter reset, active chunks only. */
  diffuse(grid: Grid, lu: ThermalLookups): void {
    const { width, temps, buffer } = this;
    const { chunkSize, chunksX, chunksY } = grid;
    const cells = grid.cells;

    // Start each tick with buffer mirroring temps so inactive chunks are preserved.
    buffer.set(temps);

    const edgeK = lu.edgeK;
    const size = lu.edgeKSize;
    const emitTemp = lu.emitTemp;
    const emitStrength = lu.emitStrength;
    const hasEmit = lu.hasEmit;

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
            const t = temps[idx];
            const id = cells[idx] & 0xfff;
            const rowInEdge = id * size;

            let sum = 0;
            if (x > 0) {
              const n = idx - 1;
              const nid = cells[n] & 0xfff;
              sum += edgeK[rowInEdge + nid] * (temps[n] - t);
            }
            if (x < width - 1) {
              const n = idx + 1;
              const nid = cells[n] & 0xfff;
              sum += edgeK[rowInEdge + nid] * (temps[n] - t);
            }
            if (y > 0) {
              const n = idx - width;
              const nid = cells[n] & 0xfff;
              sum += edgeK[rowInEdge + nid] * (temps[n] - t);
            }
            if (y < this.height - 1) {
              const n = idx + width;
              const nid = cells[n] & 0xfff;
              sum += edgeK[rowInEdge + nid] * (temps[n] - t);
            }

            // Clamp per-tick delta for a second layer of stability and
            // "feel" — a single neighbour can't instantly reshape a cell.
            if (sum > MAX_DELTA_PER_TICK) sum = MAX_DELTA_PER_TICK;
            else if (sum < -MAX_DELTA_PER_TICK) sum = -MAX_DELTA_PER_TICK;

            let newT = t + sum;
            if (hasEmit[id]) {
              newT += (emitTemp[id] - newT) * emitStrength[id];
            }

            const clamped = newT < -128 ? -128 : newT > 127 ? 127 : newT | 0;
            buffer[idx] = clamped;

            // Noticeable thermal mass → keep the chunk alive next tick so
            // the front can cross chunk borders without decaying to ambient.
            if (clamped > 3 || clamped < -3) grid.wake(x, y);
          }
        }
      }
    }

    temps.set(buffer);
    void getElement;
  }
}
