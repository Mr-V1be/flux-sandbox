import { Grid } from './Grid';
import { ThermalLookups } from './Lookups';
import { getElement } from './types';

/**
 * Temperature field: one Int8 per cell.
 *
 * Hot loop performance matters — the grid can be 500×320 and diffusion
 * runs every tick. Implementation rules:
 *   - Flat typed-array lookups (ThermalLookups) only. No Map.get, no
 *     object property access inside the loops.
 *   - Single combined pass: read this.temps, write buffer.
 *   - TypedArray.set used for full-array copies (hits memcpy).
 *   - Diffusion does NOT wake chunks. Chunks wake from element behavior
 *     or thermal state transitions, so inactive regions stay inactive.
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

  /** Single-pass diffusion + emitter application over active chunks only. */
  diffuse(grid: Grid, lu: ThermalLookups): void {
    const { width, temps, buffer } = this;
    const { chunkSize, chunksX, chunksY } = grid;
    const cells = grid.cells;

    // Start each tick with buffer mirroring temps so inactive chunks are preserved.
    buffer.set(temps);

    const conductivity = lu.conductivity;
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
            const id = cells[idx] & 0xfff; // inline getElement for speed
            const ownK = conductivity[id];

            let sum = 0;
            let count = 0;

            if (x > 0) {
              const n = idx - 1;
              const nK = conductivity[cells[n] & 0xfff];
              const k = ownK < nK ? ownK : nK;
              sum += k * (temps[n] - t);
              count++;
            }
            if (x < width - 1) {
              const n = idx + 1;
              const nK = conductivity[cells[n] & 0xfff];
              const k = ownK < nK ? ownK : nK;
              sum += k * (temps[n] - t);
              count++;
            }
            if (y > 0) {
              const n = idx - width;
              const nK = conductivity[cells[n] & 0xfff];
              const k = ownK < nK ? ownK : nK;
              sum += k * (temps[n] - t);
              count++;
            }
            if (y < this.height - 1) {
              const n = idx + width;
              const nK = conductivity[cells[n] & 0xfff];
              const k = ownK < nK ? ownK : nK;
              sum += k * (temps[n] - t);
              count++;
            }

            let newT = count > 0 ? t + sum : t;
            if (hasEmit[id]) {
              newT += (emitTemp[id] - newT) * emitStrength[id];
            }

            // Clamp-and-round into Int16 buffer (Int8 range).
            const clamped = newT < -128 ? -128 : newT > 127 ? 127 : newT | 0;
            buffer[idx] = clamped;

            // Hot cells keep their chunk warm next tick so heat can flow
            // past chunk boundaries and not freeze at the edge.
            if (clamped > 3 || clamped < -3) grid.wake(x, y);
          }
        }
      }
    }

    // Copy back (TypedArray.set is memcpy-fast).
    temps.set(buffer);

    void getElement; // silence unused
  }
}
