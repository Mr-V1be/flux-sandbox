import { Grid } from '@/core/Grid';
import { encode } from '@/core/types';
import { getIdByKey, listElements } from '@/elements/registry';

export interface Scenario {
  id: string;
  label: string;
  description: string;
  apply(grid: Grid): void;
}

const paint = (grid: Grid, key: string, cells: Array<[number, number]>) => {
  const id = getIdByKey(key);
  for (const [x, y] of cells) {
    if (grid.inBounds(x, y)) grid.set(x, y, encode(id, 0, (Math.random() * 255) | 0));
  }
};

const fillRect = (
  grid: Grid,
  key: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  chance = 1,
) => {
  const id = getIdByKey(key);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!grid.inBounds(x, y)) continue;
      if (chance < 1 && Math.random() > chance) continue;
      grid.set(x, y, encode(id, 0, (Math.random() * 255) | 0));
    }
  }
};

export const scenarios: Scenario[] = [
  {
    id: 'volcano',
    label: 'Volcano',
    description: 'A lava reservoir over a stone cone surrounded by forest.',
    apply(grid) {
      grid.clear();
      const W = grid.width;
      const H = grid.height;
      // ground
      fillRect(grid, 'stone', 0, H - 6, W - 1, H - 1);
      // cone
      for (let y = 0; y < 40; y++) {
        const spread = 40 - y;
        fillRect(grid, 'stone', W / 2 - spread, H - 6 - y, W / 2 + spread, H - 6 - y);
      }
      // crater → lava
      fillRect(grid, 'lava', W / 2 - 8, H - 44, W / 2 + 8, H - 38);
      // trees
      for (let i = 0; i < 12; i++) {
        const x = 20 + Math.floor(Math.random() * (W - 40));
        if (Math.abs(x - W / 2) < 45) continue;
        fillRect(grid, 'wood', x - 1, H - 20, x + 1, H - 7);
        fillRect(grid, 'plant', x - 5, H - 26, x + 5, H - 20, 0.6);
      }
    },
  },
  {
    id: 'circuit',
    label: 'Circuit',
    description: 'Battery → copper loop → gunpowder charge. Drop a spark.',
    apply(grid) {
      grid.clear();
      const W = grid.width;
      const H = grid.height;
      const midY = (H / 2) | 0;
      // battery on the left
      fillRect(grid, 'battery', 20, midY - 2, 23, midY + 2);
      // copper trace
      fillRect(grid, 'copper', 24, midY, W - 40, midY);
      // going down
      fillRect(grid, 'copper', W - 40, midY, W - 40, midY + 20);
      // gunpowder pile
      fillRect(grid, 'gunpowder', W - 45, midY + 21, W - 35, midY + 28);
      // wall foundation
      fillRect(grid, 'wall', 0, H - 2, W - 1, H - 1);
    },
  },
  {
    id: 'rain',
    label: 'Acid Rain',
    description: 'Forest below, acid clouds above. Watch it dissolve.',
    apply(grid) {
      grid.clear();
      const W = grid.width;
      const H = grid.height;
      fillRect(grid, 'stone', 0, H - 4, W - 1, H - 1);
      for (let x = 0; x < W; x += 12) {
        fillRect(grid, 'wood', x, H - 14, x + 1, H - 5);
        fillRect(grid, 'plant', x - 4, H - 20, x + 5, H - 14, 0.5);
      }
      fillRect(grid, 'acid', 0, 2, W - 1, 6, 0.25);
    },
  },
  {
    id: 'cryo',
    label: 'Ice Cavern',
    description: 'Frozen landscape with a central torch melting through.',
    apply(grid) {
      grid.clear();
      const W = grid.width;
      const H = grid.height;
      fillRect(grid, 'ice', 0, H / 2, W - 1, H - 1, 0.85);
      paint(grid, 'snow', [...Array(2000)].map(() => [
        (Math.random() * W) | 0,
        (Math.random() * (H / 2)) | 0,
      ] as [number, number]));
      const midX = (W / 2) | 0;
      fillRect(grid, 'torch', midX - 1, H - 6, midX + 1, H - 4);
    },
  },
  {
    id: 'reactor',
    label: 'Reactor',
    description: 'Uranium pile between water coolant and a forest. Careful.',
    apply(grid) {
      grid.clear();
      const W = grid.width;
      const H = grid.height;
      fillRect(grid, 'wall', 0, H - 2, W - 1, H - 1);
      // containment
      fillRect(grid, 'wall', W / 2 - 40, H - 40, W / 2 + 40, H - 38);
      fillRect(grid, 'wall', W / 2 - 40, H - 40, W / 2 - 38, H - 3);
      fillRect(grid, 'wall', W / 2 + 38, H - 40, W / 2 + 40, H - 3);
      // uranium core
      fillRect(grid, 'uranium', W / 2 - 6, H - 15, W / 2 + 6, H - 5);
      // water cooling jacket
      fillRect(grid, 'water', W / 2 - 35, H - 35, W / 2 - 10, H - 3, 0.8);
      fillRect(grid, 'water', W / 2 + 10, H - 35, W / 2 + 35, H - 3, 0.8);
      // forest
      for (let i = 0; i < 30; i++) {
        const x = 10 + Math.floor(Math.random() * (W - 20));
        if (Math.abs(x - W / 2) < 60) continue;
        fillRect(grid, 'wood', x, H - 16, x + 1, H - 3);
        fillRect(grid, 'plant', x - 4, H - 22, x + 5, H - 16, 0.6);
      }
    },
  },
  {
    id: 'portals',
    label: 'Portal Loop',
    description: 'Two portal pairs arranged so sand loops forever.',
    apply(grid) {
      grid.clear();
      const W = grid.width;
      const H = grid.height;
      fillRect(grid, 'wall', 0, H - 2, W - 1, H - 1);
      // Left stack
      fillRect(grid, 'wall', 80, 80, 120, 82);
      fillRect(grid, 'portal_a', 98, 78, 102, 80);
      fillRect(grid, 'sand', 95, 40, 105, 70);
      // Right stack
      fillRect(grid, 'wall', W - 120, H - 80, W - 80, H - 78);
      fillRect(grid, 'portal_b', W - 102, H - 82, W - 98, H - 80);
    },
  },
  {
    id: 'mayhem',
    label: 'Mayhem',
    description: 'Every element, 1k particles each. Stress test + chaos.',
    apply(grid) {
      grid.clear();
      const W = grid.width;
      const H = grid.height;
      const PER_ELEMENT = 1000;
      const elements = listElements().filter(
        (e) => e.key !== 'empty' && e.key !== 'wall',
      );
      // floor so things can pile up
      fillRect(grid, 'wall', 0, H - 2, W - 1, H - 1);
      for (const el of elements) {
        const id = getIdByKey(el.key);
        let placed = 0;
        let guard = 0;
        while (placed < PER_ELEMENT && guard < PER_ELEMENT * 4) {
          guard++;
          const x = Math.floor(Math.random() * W);
          const y = Math.floor(Math.random() * (H - 4));
          if (!grid.inBounds(x, y)) continue;
          grid.set(x, y, encode(id, el.key === 'fire' ? 60 : 0, (Math.random() * 255) | 0));
          placed++;
        }
      }
    },
  },
  {
    id: 'lab',
    label: 'Chem Lab',
    description: 'Crystal seed, salt bed, water, uranium — chemistry sandbox.',
    apply(grid) {
      grid.clear();
      const W = grid.width;
      const H = grid.height;
      fillRect(grid, 'wall', 0, H - 2, W - 1, H - 1);
      fillRect(grid, 'salt', 30, H - 18, 60, H - 3);
      fillRect(grid, 'water', 80, H - 18, 110, H - 3);
      fillRect(grid, 'crystal', 44, H - 19, 46, H - 19);
      fillRect(grid, 'uranium', 140, H - 10, 148, H - 3);
      fillRect(grid, 'virus', 180, H - 6, 185, H - 3);
      fillRect(grid, 'plant', 190, H - 6, 220, H - 3);
    },
  },
];
