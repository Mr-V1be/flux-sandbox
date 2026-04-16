import {
  ElementBehavior,
  encode,
  getElement,
  getLife,
  withLife,
  withUpdated,
} from '@/core/types';
import { EMPTY_ID } from '@/core/constants';
import { getDefinition, getIdByKey } from '../registry';
import { forEachNeighbor4, forEachNeighbor8 } from './helpers';

/**
 * Active "structure" elements: machine-like blocks that don't move
 * but drive interactions around them. Each is a tiny rule.
 */

const CHARGE_INITIAL = 30;
const CHARGE_MIN_PROPAGATE = 2;

/**
 * Conductor: while charged (life > 0) it spreads charge to adjacent
 * conductors with life 0, ignites flammables, and detonates explosives.
 * Uses the cell's life byte as a countdown so charge naturally fades.
 */
export const conductorBehavior: ElementBehavior = (ctx) => {
  const life = getLife(ctx.cell);
  if (life === 0) return;

  const nextLife = life - 1;

  forEachNeighbor8(ctx, (nx, ny) => {
    if (!ctx.grid.inBounds(nx, ny)) return;
    const cell = ctx.grid.get(nx, ny);
    const id = getElement(cell);
    const nd = getDefinition(id);
    if (!nd) return;

    // Propagate along conductors.
    if ((nd.key === 'copper' || nd.key === 'iron') && getLife(cell) === 0) {
      if (nextLife >= CHARGE_MIN_PROPAGATE) {
        ctx.grid.set(nx, ny, withUpdated(withLife(cell, nextLife), true));
      }
      return;
    }
    // Arc to flammables.
    if (nd.flammable && ctx.rand() < (nd.burnChance ?? 0.2) * 0.5) {
      ctx.grid.set(nx, ny, encode(getIdByKey('fire'), 40));
      return;
    }
    // Detonate explosives instantly.
    if (nd.key === 'gunpowder' || nd.key === 'bomb' || nd.key === 'nitro') {
      ctx.grid.set(nx, ny, encode(getIdByKey('fire'), 60));
    }
  });

  // Decay this cell.
  ctx.grid.set(ctx.x, ctx.y, withLife(ctx.cell, 0));
};

/** Dynamic color: uncharged dark → charged cyan-white. */
export const conductorRenderColor = (base: number, hot: number) =>
  (_cell: number, life: number): number => {
    if (life === 0) return -1;
    const t = Math.min(1, life / CHARGE_INITIAL);
    return lerpColor(base, hot, t);
  };

const lerpColor = (a: number, b: number, t: number): number => {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
};

/** Battery: periodically injects charge into adjacent conductors. */
export const batteryBehavior: ElementBehavior = (ctx) => {
  if (ctx.tick % 24 !== 0) return;
  forEachNeighbor8(ctx, (nx, ny) => {
    if (!ctx.grid.inBounds(nx, ny)) return;
    const cell = ctx.grid.get(nx, ny);
    const nd = getDefinition(getElement(cell));
    if (nd?.key === 'copper' || nd?.key === 'iron') {
      ctx.grid.set(nx, ny, withUpdated(withLife(cell, CHARGE_INITIAL), true));
    }
  });
};

/** Cloner: copies one non-trivial neighbor into another empty neighbor. */
export const clonerBehavior: ElementBehavior = (ctx) => {
  if (ctx.rand() > 0.25) return;
  let targetId = -1;
  forEachNeighbor4(ctx, (nx, ny) => {
    if (targetId !== -1) return;
    if (!ctx.grid.inBounds(nx, ny)) return;
    const id = getElement(ctx.grid.get(nx, ny));
    if (id === EMPTY_ID) return;
    const nd = getDefinition(id);
    if (!nd) return;
    if (
      nd.key === 'cloner' ||
      nd.key === 'wall' ||
      nd.key === 'void' ||
      nd.key === 'battery'
    )
      return;
    targetId = id;
  });
  if (targetId === -1) return;

  const spots: Array<[number, number]> = [];
  forEachNeighbor4(ctx, (nx, ny) => {
    if (!ctx.grid.inBounds(nx, ny)) return;
    if (getElement(ctx.grid.get(nx, ny)) === EMPTY_ID) spots.push([nx, ny]);
  });
  if (!spots.length) return;
  const pick = spots[(ctx.rand() * spots.length) | 0];
  if (!pick) return;
  const variant = (ctx.rand() * 255) | 0;
  ctx.grid.set(pick[0], pick[1], encode(targetId, 0, variant));
};

/** Void: consumes any non-empty, non-wall neighbor. */
export const voidBehavior: ElementBehavior = (ctx) => {
  forEachNeighbor4(ctx, (nx, ny) => {
    if (!ctx.grid.inBounds(nx, ny)) return;
    const cell = ctx.grid.get(nx, ny);
    const nd = getDefinition(getElement(cell));
    if (!nd) return;
    if (
      nd.key === 'empty' ||
      nd.key === 'wall' ||
      nd.key === 'void' ||
      nd.key === 'battery'
    )
      return;
    ctx.grid.set(nx, ny, encode(EMPTY_ID));
  });
};

/** Torch: persistent heat source, emits fire upward and ignites adjacents. */
export const torchBehavior: ElementBehavior = (ctx) => {
  const above = ctx.y - 1;
  if (ctx.grid.inBounds(ctx.x, above)) {
    const ac = ctx.grid.get(ctx.x, above);
    if (getElement(ac) === EMPTY_ID && ctx.rand() < 0.5) {
      ctx.grid.set(ctx.x, above, encode(getIdByKey('fire'), 20));
    }
  }
  forEachNeighbor8(ctx, (nx, ny) => {
    if (!ctx.grid.inBounds(nx, ny)) return;
    const cell = ctx.grid.get(nx, ny);
    const nd = getDefinition(getElement(cell));
    if (!nd) return;
    if (nd.flammable && ctx.rand() < (nd.burnChance ?? 0.1) * 0.4) {
      ctx.grid.set(nx, ny, encode(getIdByKey('fire'), 40));
    }
    if (nd.key === 'ice' && ctx.rand() < 0.3) {
      ctx.grid.set(nx, ny, encode(getIdByKey('water')));
    }
    if (nd.key === 'snow' && ctx.rand() < 0.4) {
      ctx.grid.set(nx, ny, encode(getIdByKey('water')));
    }
  });
};

/** Fan: blows cells above it upward (also steam / smoke / gas). */
export const fanBehavior: ElementBehavior = (ctx) => {
  // Look at the column above and nudge the lowest non-solid cell up.
  for (let step = 1; step <= 4; step++) {
    const y = ctx.y - step;
    if (!ctx.grid.inBounds(ctx.x, y)) return;
    const cell = ctx.grid.get(ctx.x, y);
    const id = getElement(cell);
    if (id === EMPTY_ID) continue;
    const nd = getDefinition(id);
    if (!nd) return;
    if (nd.category === 'solid' || nd.key === 'wall') return;
    // Move this cell up by 1 if space.
    const to = y - 1;
    if (!ctx.grid.inBounds(ctx.x, to)) return;
    if (getElement(ctx.grid.get(ctx.x, to)) !== EMPTY_ID) return;
    if (ctx.rand() < 0.8) {
      ctx.grid.swap(ctx.x, y, ctx.x, to);
      ctx.markUpdated(ctx.x, to);
    }
    return;
  }
};

/** Magnet: attracts nearby iron one step closer per tick. */
export const magnetBehavior: ElementBehavior = (ctx) => {
  const RANGE = 6;
  const ironId = getIdByKey('iron');
  for (let dy = -RANGE; dy <= RANGE; dy++) {
    for (let dx = -RANGE; dx <= RANGE; dx++) {
      if (dx === 0 && dy === 0) continue;
      const x = ctx.x + dx;
      const y = ctx.y + dy;
      if (!ctx.grid.inBounds(x, y)) continue;
      if (getElement(ctx.grid.get(x, y)) !== ironId) continue;
      const sx = dx === 0 ? 0 : -Math.sign(dx);
      const sy = dy === 0 ? 0 : -Math.sign(dy);
      const tx = x + sx;
      const ty = y + sy;
      if (!ctx.grid.inBounds(tx, ty)) continue;
      if (getElement(ctx.grid.get(tx, ty)) !== EMPTY_ID) continue;
      if (ctx.rand() < 0.2) {
        ctx.grid.swap(x, y, tx, ty);
        ctx.markUpdated(tx, ty);
      }
    }
  }
};
