import { Grid } from './Grid';
import { MAX_DELTA_PER_TICK, TEMP_MAX, TEMP_MIN, ThermalLookups } from './Lookups';
import { getElement } from './types';

/**
 * Temperature field — one signed 16-bit temperature per cell, in °C.
 *
 * Heat equation (forward-Euler, 4-neighbour 2D Laplacian):
 *
 *     T'(x,y) = T(x,y) + Σ_n  k_pair(T, n) · (T_n − T)
 *
 * where `k_pair(a, b)` is a precomputed harmonic mean of each pair's
 * conductivity (series heat transfer), clamped at `MAX_EDGE_K`. The flux
 * is then divided by the destination cell's heat capacity and the total
 * per-tick delta is clipped at `MAX_DELTA_PER_TICK` to keep marginally
 * stable mixes (low-capacity air next to metal) well-behaved.
 *
 * Cells whose temperature reads noticeably non-ambient wake their chunk
 * next tick so a heat front can cross chunk boundaries it wasn't active
 * in yet.
 */

/** Wake-up threshold in °C — |t| below this is treated as ambient noise. */
const WAKE_THRESHOLD = 8;

export class TemperatureField {
  public readonly temps: Int16Array;
  private readonly buffer: Int32Array;

  constructor(public readonly width: number, public readonly height: number) {
    this.temps = new Int16Array(width * height);
    this.buffer = new Int32Array(width * height);
  }

  index(x: number, y: number): number {
    return y * this.width + x;
  }

  get(x: number, y: number): number {
    return this.temps[this.index(x, y)];
  }

  set(x: number, y: number, t: number): void {
    const v = t < TEMP_MIN ? TEMP_MIN : t > TEMP_MAX ? TEMP_MAX : t | 0;
    this.temps[this.index(x, y)] = v;
  }

  add(x: number, y: number, delta: number): void {
    const idx = this.index(x, y);
    const v = this.temps[idx] + delta;
    this.temps[idx] = v < TEMP_MIN ? TEMP_MIN : v > TEMP_MAX ? TEMP_MAX : v | 0;
  }

  clear(): void {
    this.temps.fill(0);
    this.buffer.fill(0);
  }

  /** Single-pass physical diffusion + emitter pull, active chunks only. */
  diffuse(grid: Grid, lu: ThermalLookups): void {
    const { width, temps, buffer } = this;
    const { chunkSize, chunksX, chunksY } = grid;
    const cells = grid.cells;

    // Start each tick with buffer mirroring temps so inactive chunks are preserved.
    buffer.set(temps);

    const edgeK = lu.edgeK;
    const invHeatCapacity = lu.invHeatCapacity;
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

            // Scale by 1/heatCapacity: high-capacity cells (water, stone)
            // resist temperature change; low-capacity cells (air, gases)
            // swing fast. Same energy flux, different dT.
            sum *= invHeatCapacity[id];

            if (sum > MAX_DELTA_PER_TICK) sum = MAX_DELTA_PER_TICK;
            else if (sum < -MAX_DELTA_PER_TICK) sum = -MAX_DELTA_PER_TICK;

            let newT = t + sum;
            if (hasEmit[id]) {
              newT += (emitTemp[id] - newT) * emitStrength[id];
            }

            const clamped =
              newT < TEMP_MIN ? TEMP_MIN : newT > TEMP_MAX ? TEMP_MAX : newT | 0;
            buffer[idx] = clamped;

            // Noticeable thermal mass → keep the chunk alive next tick so
            // the front can cross chunk borders without decaying to ambient.
            if (clamped > WAKE_THRESHOLD || clamped < -WAKE_THRESHOLD) grid.wake(x, y);
          }
        }
      }
    }

    temps.set(buffer);
    void getElement;
  }
}
