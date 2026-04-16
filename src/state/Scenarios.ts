import { Grid } from '@/core/Grid';
import { TemperatureField } from '@/core/TemperatureField';
import { encode } from '@/core/types';
import { resolveSpawnTemp } from '@/core/spawnTemp';
import { getDefinitionByKey, getIdByKey, listElements } from '@/elements/registry';

export interface Scenario {
  id: string;
  label: string;
  description: string;
  apply(grid: Grid, field: TemperatureField): void;
}

/** Room temperature so materials without a spawnTemp inherit 20 °C. */
const AMBIENT = 20;

const spawnTempOf = (key: string): number => {
  const def = getDefinitionByKey(key);
  return resolveSpawnTemp(def ?? undefined, AMBIENT);
};

const paint = (
  grid: Grid,
  field: TemperatureField,
  key: string,
  cells: Array<[number, number]>,
): void => {
  const id = getIdByKey(key);
  const t = spawnTempOf(key);
  for (const [x, y] of cells) {
    if (!grid.inBounds(x, y)) continue;
    grid.set(x, y, encode(id, 0, (Math.random() * 255) | 0));
    field.set(x, y, t);
  }
};

const fillRect = (
  grid: Grid,
  field: TemperatureField,
  key: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  chance = 1,
): void => {
  const id = getIdByKey(key);
  const t = spawnTempOf(key);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!grid.inBounds(x, y)) continue;
      if (chance < 1 && Math.random() > chance) continue;
      grid.set(x, y, encode(id, 0, (Math.random() * 255) | 0));
      field.set(x, y, t);
    }
  }
};

const resetWorld = (grid: Grid, field: TemperatureField): void => {
  grid.clear();
  field.clear();
};

export const scenarios: Scenario[] = [
  {
    id: 'volcano',
    label: 'Volcano',
    description: 'A lava reservoir over a stone cone surrounded by forest.',
    apply(grid, field) {
      resetWorld(grid, field);
      const W = grid.width;
      const H = grid.height;
      fillRect(grid, field, 'stone', 0, H - 6, W - 1, H - 1);
      for (let y = 0; y < 40; y++) {
        const spread = 40 - y;
        fillRect(grid, field, 'stone', W / 2 - spread, H - 6 - y, W / 2 + spread, H - 6 - y);
      }
      fillRect(grid, field, 'lava', W / 2 - 8, H - 44, W / 2 + 8, H - 38);
      for (let i = 0; i < 12; i++) {
        const x = 20 + Math.floor(Math.random() * (W - 40));
        if (Math.abs(x - W / 2) < 45) continue;
        fillRect(grid, field, 'wood', x - 1, H - 20, x + 1, H - 7);
        fillRect(grid, field, 'plant', x - 5, H - 26, x + 5, H - 20, 0.6);
      }
    },
  },
  {
    id: 'circuit',
    label: 'Circuit',
    description: 'Battery → copper loop → gunpowder charge. Drop a spark.',
    apply(grid, field) {
      resetWorld(grid, field);
      const W = grid.width;
      const H = grid.height;
      const midY = (H / 2) | 0;
      fillRect(grid, field, 'battery', 20, midY - 2, 23, midY + 2);
      fillRect(grid, field, 'copper', 24, midY, W - 40, midY);
      fillRect(grid, field, 'copper', W - 40, midY, W - 40, midY + 20);
      fillRect(grid, field, 'gunpowder', W - 45, midY + 21, W - 35, midY + 28);
      fillRect(grid, field, 'wall', 0, H - 2, W - 1, H - 1);
    },
  },
  {
    id: 'rain',
    label: 'Acid Rain',
    description: 'Forest below, acid clouds above. Watch it dissolve.',
    apply(grid, field) {
      resetWorld(grid, field);
      const W = grid.width;
      const H = grid.height;
      fillRect(grid, field, 'stone', 0, H - 4, W - 1, H - 1);
      for (let x = 0; x < W; x += 12) {
        fillRect(grid, field, 'wood', x, H - 14, x + 1, H - 5);
        fillRect(grid, field, 'plant', x - 4, H - 20, x + 5, H - 14, 0.5);
      }
      fillRect(grid, field, 'acid', 0, 2, W - 1, 6, 0.25);
    },
  },
  {
    id: 'cryo',
    label: 'Ice Cavern',
    description: 'Frozen landscape with a central torch melting through.',
    apply(grid, field) {
      resetWorld(grid, field);
      const W = grid.width;
      const H = grid.height;
      fillRect(grid, field, 'ice', 0, H / 2, W - 1, H - 1, 0.85);
      paint(grid, field, 'snow', [...Array(2000)].map(() => [
        (Math.random() * W) | 0,
        (Math.random() * (H / 2)) | 0,
      ] as [number, number]));
      const midX = (W / 2) | 0;
      fillRect(grid, field, 'torch', midX - 1, H - 6, midX + 1, H - 4);
    },
  },
  {
    id: 'reactor',
    label: 'Reactor',
    description: 'Uranium pile between water coolant and a forest. Careful.',
    apply(grid, field) {
      resetWorld(grid, field);
      const W = grid.width;
      const H = grid.height;
      fillRect(grid, field, 'wall', 0, H - 2, W - 1, H - 1);
      fillRect(grid, field, 'wall', W / 2 - 40, H - 40, W / 2 + 40, H - 38);
      fillRect(grid, field, 'wall', W / 2 - 40, H - 40, W / 2 - 38, H - 3);
      fillRect(grid, field, 'wall', W / 2 + 38, H - 40, W / 2 + 40, H - 3);
      fillRect(grid, field, 'uranium', W / 2 - 6, H - 15, W / 2 + 6, H - 5);
      fillRect(grid, field, 'water', W / 2 - 35, H - 35, W / 2 - 10, H - 3, 0.8);
      fillRect(grid, field, 'water', W / 2 + 10, H - 35, W / 2 + 35, H - 3, 0.8);
      for (let i = 0; i < 30; i++) {
        const x = 10 + Math.floor(Math.random() * (W - 20));
        if (Math.abs(x - W / 2) < 60) continue;
        fillRect(grid, field, 'wood', x, H - 16, x + 1, H - 3);
        fillRect(grid, field, 'plant', x - 4, H - 22, x + 5, H - 16, 0.6);
      }
    },
  },
  {
    id: 'portals',
    label: 'Portal Loop',
    description: 'Two portal pairs arranged so sand loops forever.',
    apply(grid, field) {
      resetWorld(grid, field);
      const W = grid.width;
      const H = grid.height;
      fillRect(grid, field, 'wall', 0, H - 2, W - 1, H - 1);
      fillRect(grid, field, 'wall', 80, 80, 120, 82);
      fillRect(grid, field, 'portal_a', 98, 78, 102, 80);
      fillRect(grid, field, 'sand', 95, 40, 105, 70);
      fillRect(grid, field, 'wall', W - 120, H - 80, W - 80, H - 78);
      fillRect(grid, field, 'portal_b', W - 102, H - 82, W - 98, H - 80);
    },
  },
  {
    id: 'mayhem',
    label: 'Mayhem',
    description: 'Every element, 1k particles each. Stress test + chaos.',
    apply(grid, field) {
      resetWorld(grid, field);
      const W = grid.width;
      const H = grid.height;
      const PER_ELEMENT = 1000;
      const elements = listElements().filter(
        (e) => e.key !== 'empty' && e.key !== 'wall',
      );
      fillRect(grid, field, 'wall', 0, H - 2, W - 1, H - 1);
      for (const el of elements) {
        const id = getIdByKey(el.key);
        const t = spawnTempOf(el.key);
        let placed = 0;
        let guard = 0;
        while (placed < PER_ELEMENT && guard < PER_ELEMENT * 4) {
          guard++;
          const x = Math.floor(Math.random() * W);
          const y = Math.floor(Math.random() * (H - 4));
          if (!grid.inBounds(x, y)) continue;
          grid.set(x, y, encode(id, el.key === 'fire' ? 60 : 0, (Math.random() * 255) | 0));
          field.set(x, y, t);
          placed++;
        }
      }
    },
  },
  {
    id: 'lab',
    label: 'Chem Lab',
    description: 'Crystal seed, salt bed, water, uranium — chemistry sandbox.',
    apply(grid, field) {
      resetWorld(grid, field);
      const W = grid.width;
      const H = grid.height;
      fillRect(grid, field, 'wall', 0, H - 2, W - 1, H - 1);
      fillRect(grid, field, 'salt', 30, H - 18, 60, H - 3);
      fillRect(grid, field, 'water', 80, H - 18, 110, H - 3);
      fillRect(grid, field, 'crystal', 44, H - 19, 46, H - 19);
      fillRect(grid, field, 'uranium', 140, H - 10, 148, H - 3);
      fillRect(grid, field, 'virus', 180, H - 6, 185, H - 3);
      fillRect(grid, field, 'plant', 190, H - 6, 220, H - 3);
    },
  },
];
