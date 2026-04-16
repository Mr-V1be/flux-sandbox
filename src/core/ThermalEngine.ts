import { Grid } from './Grid';
import { TemperatureField } from './TemperatureField';
import { ThermalLookups } from './Lookups';
import { encode } from './types';
import { EMPTY_ID } from './constants';
import { EventBus } from '@/effects/EventBus';

/**
 * Applies temperature-driven state transitions using flat lookup arrays.
 * Runs AFTER diffusion. Iterates only active chunks.
 */
export class ThermalEngine {
  private readonly fireId: number;
  private readonly smokeId: number;
  private readonly wallId: number;

  constructor(
    private readonly lookups: ThermalLookups,
    keyToId: ReadonlyMap<string, number>,
    public bus: EventBus | null = null,
  ) {
    this.fireId = keyToId.get('fire') ?? -1;
    this.smokeId = keyToId.get('smoke') ?? EMPTY_ID;
    this.wallId = keyToId.get('wall') ?? -1;
  }

  apply(grid: Grid, field: TemperatureField, rand: () => number): void {
    const { chunkSize, chunksX, chunksY, width, height } = grid;
    const cells = grid.cells;
    const temps = field.temps;

    const lu = this.lookups;

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
            const id = cells[idx] & 0xfff;
            if (id === EMPTY_ID) continue;
            if (!lu.hasThermal[id]) continue;

            const t = temps[idx];

            if (lu.hasIgnite[id] && t >= lu.ignitesAt[id]) {
              const radius = lu.explodeRadius[id];
              if (radius > 0) {
                this.explode(grid, field, x, y, radius, rand);
                this.bus?.emit({ type: 'explosion', x, y, radius });
              } else {
                grid.set(x, y, encode(this.fireId, 60));
                field.set(x, y, 80);
                this.bus?.emit({ type: 'ignition', x, y });
              }
              continue;
            }
            if (lu.hasMelt[id] && t >= lu.meltAt[id]) {
              if (rand() < 0.4) grid.set(x, y, encode(lu.meltsInto[id]));
              continue;
            }
            if (lu.hasBoil[id] && t >= lu.boilAt[id]) {
              if (rand() < 0.25) {
                grid.set(x, y, encode(lu.boilsInto[id]));
                if (rand() < 0.02) this.bus?.emit({ type: 'boil', x, y });
              }
              continue;
            }
            if (lu.hasFreeze[id] && t <= lu.freezeAt[id]) {
              if (rand() < 0.35) {
                grid.set(x, y, encode(lu.freezesInto[id]));
                if (rand() < 0.02) this.bus?.emit({ type: 'freeze', x, y });
              }
              continue;
            }
            if (lu.hasCondense[id] && t <= lu.condenseAt[id]) {
              if (rand() < 0.2) grid.set(x, y, encode(lu.condensesInto[id]));
              continue;
            }
          }
        }
      }
    }
  }

  private explode(
    grid: Grid,
    field: TemperatureField,
    cx: number,
    cy: number,
    radius: number,
    rand: () => number,
  ): void {
    const fire = this.fireId;
    const smoke = this.smokeId;
    const wall = this.wallId;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (!grid.inBounds(x, y)) continue;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > radius) continue;
        const id = grid.cells[grid.index(x, y)] & 0xfff;
        if (id === wall) continue;
        if (dist < radius * 0.5) {
          grid.set(x, y, encode(fire, 60));
          field.set(x, y, 90);
        } else if (rand() < 0.4) {
          grid.set(x, y, encode(smoke, 220));
          field.set(x, y, 40);
        } else {
          grid.set(x, y, encode(EMPTY_ID));
          field.set(x, y, 30);
        }
      }
    }
  }
}
