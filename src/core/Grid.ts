import { GridApi, encode, getElement } from './types';
import { EMPTY_ID } from './constants';

/**
 * Dense grid backed by a Uint32Array + chunk activity bitmap.
 *
 * Responsibilities:
 *   - storage + bounds-checked access + swap
 *   - track which 16×16 chunks have activity so the simulator can skip dead space
 *
 * Chunk activity uses double-buffering: `activeNow` is what the current tick
 * iterates, `activeNext` is what gets woken by this tick's writes.
 * At the end of each tick we swap them.
 */
export class Grid implements GridApi {
  public readonly cells: Uint32Array;
  public readonly chunkSize: number;
  public readonly chunksX: number;
  public readonly chunksY: number;
  private activeNow: Uint8Array;
  private activeNext: Uint8Array;

  /**
   * Optional link to a parallel temperature field. When present, `swap`
   * moves cells AND their temperatures together — so a cold water cell
   * falling through warm air doesn't instantly reheat at its destination
   * while leaving a phantom cold spot behind. Set via `linkField()`.
   */
  private field: { temps: Int8Array } | null = null;

  constructor(
    public readonly width: number,
    public readonly height: number,
    chunkSize = 16,
  ) {
    this.cells = new Uint32Array(width * height);
    this.chunkSize = chunkSize;
    this.chunksX = Math.ceil(width / chunkSize);
    this.chunksY = Math.ceil(height / chunkSize);
    const chunkCount = this.chunksX * this.chunksY;
    this.activeNow = new Uint8Array(chunkCount);
    this.activeNext = new Uint8Array(chunkCount);
  }

  index(x: number, y: number): number {
    return y * this.width + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  get(x: number, y: number): number {
    return this.cells[this.index(x, y)];
  }

  set(x: number, y: number, cell: number): void {
    this.cells[this.index(x, y)] = cell;
    this.wake(x, y);
  }

  /** Low-level set without waking chunks — only for internal bulk ops. */
  setSilent(x: number, y: number, cell: number): void {
    this.cells[this.index(x, y)] = cell;
  }

  swap(ax: number, ay: number, bx: number, by: number): void {
    const ai = this.index(ax, ay);
    const bi = this.index(bx, by);
    const tmp = this.cells[ai];
    this.cells[ai] = this.cells[bi];
    this.cells[bi] = tmp;
    // Temperature travels with the cell. Without this, cold water falling
    // through warm air would leave its cold behind and instantly warm up.
    if (this.field) {
      const t = this.field.temps;
      const tt = t[ai];
      t[ai] = t[bi];
      t[bi] = tt;
    }
    this.wake(ax, ay);
    this.wake(bx, by);
  }

  /** Attach a temperature field so swaps move temperatures along with cells. */
  linkField(field: { temps: Int8Array }): void {
    this.field = field;
  }

  clear(): void {
    const blank = encode(EMPTY_ID);
    this.cells.fill(blank);
    this.activeNext.fill(1);
  }

  /** Mark chunk-under-(x,y) and its 8 neighbors active for the next tick. */
  wake(x: number, y: number): void {
    const cx = (x / this.chunkSize) | 0;
    const cy = (y / this.chunkSize) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= this.chunksX || ny >= this.chunksY) continue;
        this.activeNext[ny * this.chunksX + nx] = 1;
      }
    }
  }

  /** Wake every chunk — useful after a bulk scenario load. */
  wakeAll(): void {
    this.activeNext.fill(1);
  }

  isChunkActive(cx: number, cy: number): boolean {
    return this.activeNow[cy * this.chunksX + cx] === 1;
  }

  /** Called by the simulation at the end of each tick. */
  swapActivity(): void {
    const tmp = this.activeNow;
    this.activeNow = this.activeNext;
    this.activeNext = tmp;
    this.activeNext.fill(0);
  }

  /** Count of chunks active this tick (cheap stat). */
  activeChunkCount(): number {
    let n = 0;
    const a = this.activeNow;
    for (let i = 0; i < a.length; i++) if (a[i]) n++;
    return n;
  }

  /** Reset the updated flag on cells inside active chunks only. */
  resetUpdatedFlags(): void {
    const UNSET = ~(1 << 28) >>> 0;
    const { width, chunkSize, chunksX, chunksY } = this;
    for (let cy = 0; cy < chunksY; cy++) {
      for (let cx = 0; cx < chunksX; cx++) {
        if (!this.isChunkActive(cx, cy)) continue;
        const x0 = cx * chunkSize;
        const y0 = cy * chunkSize;
        const x1 = Math.min(x0 + chunkSize, this.width);
        const y1 = Math.min(y0 + chunkSize, this.height);
        for (let y = y0; y < y1; y++) {
          const row = y * width;
          for (let x = x0; x < x1; x++) {
            this.cells[row + x] &= UNSET;
          }
        }
      }
    }
  }

  isEmpty(x: number, y: number): boolean {
    return getElement(this.get(x, y)) === EMPTY_ID;
  }
}
