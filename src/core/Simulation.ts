import { Grid } from './Grid';
import { TemperatureField } from './TemperatureField';
import { ThermalEngine } from './ThermalEngine';
import { buildThermalLookups, ThermalLookups } from './Lookups';
import {
  ElementContext,
  ElementDefinition,
  getElement,
  isUpdated,
  withUpdated,
} from './types';
import { EMPTY_ID } from './constants';
import { EventBus } from '@/effects/EventBus';

const createRng = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export interface SimulationOptions {
  width: number;
  height: number;
  seed?: number;
  bus?: EventBus;
}

/**
 * Owns grid + temperature field + lookups + engines.
 * Tick order: element updates → diffusion → thermal transitions → chunk swap.
 */
export class Simulation {
  public readonly grid: Grid;
  public readonly field: TemperatureField;
  public readonly thermal: ThermalEngine;
  public readonly lookups: ThermalLookups;
  public tick = 0;
  private readonly rand: () => number;

  constructor(
    opts: SimulationOptions,
    /**
     * Flat array indexed by elementId. Fast O(1) access in updateCell's
     * hot loop, avoids Map.get overhead.
     */
    private readonly registry: readonly ElementDefinition[],
  ) {
    this.grid = new Grid(opts.width, opts.height);
    this.field = new TemperatureField(opts.width, opts.height);
    // Let the grid's swap operation move temperatures alongside cells.
    this.grid.linkField(this.field);
    this.lookups = buildThermalLookups(registry);
    const keyToId = new Map<string, number>();
    for (let i = 0; i < registry.length; i++) {
      const d = registry[i];
      if (d) keyToId.set(d.key, i);
    }
    this.thermal = new ThermalEngine(this.lookups, keyToId, opts.bus ?? null);
    this.rand = createRng(opts.seed ?? 0xc0ffee);
  }

  step(): void {
    this.tick++;
    this.grid.swapActivity();
    this.grid.resetUpdatedFlags();

    const { width, height } = this.grid;
    const { chunkSize, chunksX, chunksY } = this.grid;

    // Element updates: bottom-up scan over active chunks.
    for (let cy = chunksY - 1; cy >= 0; cy--) {
      for (let y = Math.min((cy + 1) * chunkSize, height) - 1; y >= cy * chunkSize; y--) {
        const leftToRight = (y + this.tick) % 2 === 0;
        if (leftToRight) {
          for (let cx = 0; cx < chunksX; cx++) {
            if (!this.grid.isChunkActive(cx, cy)) continue;
            const x0 = cx * chunkSize;
            const x1 = Math.min(x0 + chunkSize, width);
            for (let x = x0; x < x1; x++) this.updateCell(x, y);
          }
        } else {
          for (let cx = chunksX - 1; cx >= 0; cx--) {
            if (!this.grid.isChunkActive(cx, cy)) continue;
            const x0 = cx * chunkSize;
            const x1 = Math.min(x0 + chunkSize, width);
            for (let x = x1 - 1; x >= x0; x--) this.updateCell(x, y);
          }
        }
      }
    }

    this.field.diffuse(this.grid, this.lookups);
    this.thermal.apply(this.grid, this.field, this.rand);
  }

  private updateCell(x: number, y: number): void {
    const grid = this.grid;
    const cell = grid.get(x, y);
    if (isUpdated(cell)) return;
    const id = getElement(cell);
    if (id === EMPTY_ID) return;

    // Thermal-active elements need their chunk alive next tick even if
    // nothing else touches them (otherwise they can't keep emitting/
    // transitioning when settled).
    if (this.lookups.needsActive[id]) {
      grid.wake(x, y);
    }

    const def = this.registry[id];
    if (def?.update) {
      const ctx: ElementContext = {
        grid,
        field: this.field,
        x,
        y,
        cell,
        tick: this.tick,
        rand: this.rand,
        markUpdated: (mx, my) => {
          if (!grid.inBounds(mx, my)) return;
          // Set the flag on the underlying typed array so we don't re-wake
          // the chunk for a pure bookkeeping write.
          const idx = grid.index(mx, my);
          grid.cells[idx] = withUpdated(grid.cells[idx], true);
        },
      };
      def.update(ctx);
    }

    const idx = grid.index(x, y);
    const after = grid.cells[idx];
    if (!isUpdated(after)) {
      grid.cells[idx] = withUpdated(after, true);
    }
  }
}
