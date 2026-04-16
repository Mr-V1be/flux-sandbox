import {
  ElementBehavior,
  ElementContext,
  encode,
  getElement,
} from '@/core/types';
import { EMPTY_ID } from '@/core/constants';
import { getDefinition, getIdByKey } from '../registry';
import { forEachNeighbor4, forEachNeighbor8 } from './helpers';

/**
 * "Exotic" behaviors — elements with unusual mechanics (gravity, portals,
 * lightning, stickiness). Kept separate from mundane movement/reactions.
 */

// ═══════════════════════════════════════════════════════════════════════
// Black hole — pulls and consumes.
// ═══════════════════════════════════════════════════════════════════════

const BLACK_HOLE_RADIUS = 8;
const BLACK_HOLE_EVENT_HORIZON = 1.6;

export const blackHoleBehavior: ElementBehavior = (ctx) => {
  const R = BLACK_HOLE_RADIUS;
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      if (dx === 0 && dy === 0) continue;
      const x = ctx.x + dx;
      const y = ctx.y + dy;
      if (!ctx.grid.inBounds(x, y)) continue;
      const id = getElement(ctx.grid.get(x, y));
      if (id === EMPTY_ID) continue;
      const nd = getDefinition(id);
      if (!nd || nd.key === 'blackhole' || nd.key === 'wall') continue;

      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > R) continue;

      // Event horizon: annihilate.
      if (dist <= BLACK_HOLE_EVENT_HORIZON) {
        ctx.grid.set(x, y, encode(EMPTY_ID));
        continue;
      }

      // Outside horizon: pull one cell toward the center with probability
      // scaling inversely with distance (close = strong gravity).
      const sx = dx > 0 ? -1 : dx < 0 ? 1 : 0;
      const sy = dy > 0 ? -1 : dy < 0 ? 1 : 0;
      const tx = x + sx;
      const ty = y + sy;
      if (!ctx.grid.inBounds(tx, ty)) continue;
      if (getElement(ctx.grid.get(tx, ty)) !== EMPTY_ID) continue;
      const pull = Math.min(0.55, 1.5 / dist);
      if (ctx.rand() < pull) {
        ctx.grid.swap(x, y, tx, ty);
        ctx.markUpdated(tx, ty);
      }
    }
  }
};

// ═══════════════════════════════════════════════════════════════════════
// Antigravity — pushes cells above it upward.
// ═══════════════════════════════════════════════════════════════════════

export const antigravityBehavior: ElementBehavior = (ctx) => {
  // Walk upward column; lift any non-solid cell by one step into empty above.
  for (let dy = 1; dy <= 8; dy++) {
    const y = ctx.y - dy;
    if (!ctx.grid.inBounds(ctx.x, y)) return;
    const id = getElement(ctx.grid.get(ctx.x, y));
    if (id === EMPTY_ID) continue;
    const nd = getDefinition(id);
    if (!nd) return;
    if (nd.key === 'wall' || nd.category === 'solid') return;
    const above = y - 1;
    if (!ctx.grid.inBounds(ctx.x, above)) return;
    if (getElement(ctx.grid.get(ctx.x, above)) !== EMPTY_ID) return;
    if (ctx.rand() < 0.7) {
      ctx.grid.swap(ctx.x, y, ctx.x, above);
      ctx.markUpdated(ctx.x, above);
    }
    return;
  }
};

// ═══════════════════════════════════════════════════════════════════════
// Lightning rod — periodically fires a bolt of sparks from the sky.
// ═══════════════════════════════════════════════════════════════════════

export const lightningRodBehavior: ElementBehavior = (ctx) => {
  // Trigger once every ~4 seconds at 60fps with jitter.
  if (ctx.tick % 240 !== 0) return;
  if (ctx.rand() > 0.6) return;
  const sparkId = getIdByKey('spark');
  // Column of sparks descending onto the rod. They live for a single tick,
  // so any flammable / conductor they touch reacts immediately.
  for (let dy = 1; dy <= 40; dy++) {
    const y = ctx.y - dy;
    if (!ctx.grid.inBounds(ctx.x, y)) break;
    const id = getElement(ctx.grid.get(ctx.x, y));
    if (id !== EMPTY_ID) {
      // Terminal target — arc through it instead of placing a spark.
      const nd = getDefinition(id);
      if (nd?.flammable) {
        ctx.grid.set(ctx.x, y, encode(getIdByKey('fire'), 50));
      } else if (nd?.key === 'copper' || nd?.key === 'iron') {
        // jolt the conductor
        const cell = ctx.grid.get(ctx.x, y);
        ctx.grid.set(ctx.x, y, (cell & ~0x000ff000) | (30 << 12));
      }
      break;
    }
    ctx.grid.set(ctx.x, y, encode(sparkId));
  }
  void sparkId;
};

// ═══════════════════════════════════════════════════════════════════════
// Glue — pins adjacent loose cells (mark them updated each tick so
// powder/liquid behaviors skip their fall).
// ═══════════════════════════════════════════════════════════════════════

export const glueBehavior: ElementBehavior = (ctx) => {
  forEachNeighbor8(ctx, (nx, ny) => {
    if (!ctx.grid.inBounds(nx, ny)) return;
    const id = getElement(ctx.grid.get(nx, ny));
    if (id === EMPTY_ID) return;
    const nd = getDefinition(id);
    if (!nd) return;
    if (nd.category === 'powder' || nd.category === 'liquid') {
      ctx.markUpdated(nx, ny);
    }
  });
};

// ═══════════════════════════════════════════════════════════════════════
// Portals — entangled pair. Cells entering one side exit at the other.
// ═══════════════════════════════════════════════════════════════════════

interface PortalSlot {
  x: number;
  y: number;
}

let portalA: PortalSlot[] = [];
let portalB: PortalSlot[] = [];
let portalCacheTick = -1;

/** Walk the grid once per tick to refresh the portal location caches. */
const refreshPortalCache = (ctx: ElementContext): void => {
  if (portalCacheTick === ctx.tick) return;
  portalCacheTick = ctx.tick;
  portalA = [];
  portalB = [];
  const aId = getIdByKey('portal_a');
  const bId = getIdByKey('portal_b');
  const cells = ctx.grid.cells;
  const W = ctx.grid.width;
  for (let i = 0; i < cells.length; i++) {
    const id = cells[i] & 0xfff;
    if (id === aId) portalA.push({ x: i % W, y: (i / W) | 0 });
    else if (id === bId) portalB.push({ x: i % W, y: (i / W) | 0 });
  }
};

const createPortalBehavior = (color: 'a' | 'b'): ElementBehavior => (ctx) => {
  refreshPortalCache(ctx);
  const targets = color === 'a' ? portalB : portalA;
  if (targets.length === 0) return;

  // Look for any adjacent movable cell to yoink.
  let consumed = false;
  forEachNeighbor4(ctx, (nx, ny) => {
    if (consumed) return;
    if (!ctx.grid.inBounds(nx, ny)) return;
    const cell = ctx.grid.get(nx, ny);
    const id = getElement(cell);
    if (id === EMPTY_ID) return;
    const nd = getDefinition(id);
    if (!nd) return;
    if (
      nd.category !== 'powder' &&
      nd.category !== 'liquid' &&
      nd.category !== 'gas' &&
      nd.category !== 'special'
    )
      return;

    // Teleport to an empty neighbor of a random paired portal.
    const pick = targets[(ctx.rand() * targets.length) | 0]!;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const ex = pick.x + dx;
        const ey = pick.y + dy;
        if (!ctx.grid.inBounds(ex, ey)) continue;
        if (getElement(ctx.grid.get(ex, ey)) !== EMPTY_ID) continue;
        ctx.grid.set(ex, ey, cell);
        ctx.grid.set(nx, ny, encode(EMPTY_ID));
        ctx.markUpdated(ex, ey);
        consumed = true;
        return;
      }
    }
  });
};

export const portalABehavior: ElementBehavior = createPortalBehavior('a');
export const portalBBehavior: ElementBehavior = createPortalBehavior('b');

// ═══════════════════════════════════════════════════════════════════════
// Pulsing render helpers (uranium glow, portal hum).
// ═══════════════════════════════════════════════════════════════════════

const lerpColor = (a: number, b: number, t: number): number => {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  return (
    (Math.round(ar + (br - ar) * t) << 16) |
    (Math.round(ag + (bg - ag) * t) << 8) |
    Math.round(ab + (bb - ab) * t)
  );
};

/** Smooth sinusoidal pulse between two colours, keyed off wall-clock. */
export const pulseRenderColor = (cold: number, hot: number, speed = 0.004) => {
  return (): number => {
    const t = (Math.sin(performance.now() * speed) + 1) * 0.5;
    return lerpColor(cold, hot, t);
  };
};

// ═══════════════════════════════════════════════════════════════════════
// Antimatter — annihilates on contact with anything non-wall.
// ═══════════════════════════════════════════════════════════════════════

export const antimatterBehavior: ElementBehavior = (ctx) => {
  let triggered = false;
  forEachNeighbor8(ctx, (nx, ny) => {
    if (triggered) return;
    if (!ctx.grid.inBounds(nx, ny)) return;
    const cell = ctx.grid.get(nx, ny);
    const id = getElement(cell);
    if (id === EMPTY_ID) return;
    const nd = getDefinition(id);
    if (!nd || nd.key === 'wall' || nd.key === 'antimatter') return;
    // Annihilate neighbour and self, leave fire + heat.
    const fireId = getIdByKey('fire');
    ctx.grid.set(nx, ny, encode(fireId, 60));
    ctx.grid.set(ctx.x, ctx.y, encode(fireId, 60));
    ctx.field.set(nx, ny, 1000);
    ctx.field.set(ctx.x, ctx.y, 1000);
    triggered = true;
  });
};

// ═══════════════════════════════════════════════════════════════════════
// Ice-9 — crystallises any adjacent water into more ice-9 (chain reaction).
// ═══════════════════════════════════════════════════════════════════════

export const ice9Behavior: ElementBehavior = (ctx) => {
  const selfId = getIdByKey('ice9');
  forEachNeighbor8(ctx, (nx, ny) => {
    if (!ctx.grid.inBounds(nx, ny)) return;
    const nd = getDefinition(getElement(ctx.grid.get(nx, ny)));
    if (nd?.key === 'water' && ctx.rand() < 0.5) {
      ctx.grid.set(nx, ny, encode(selfId));
    }
  });
};

// ═══════════════════════════════════════════════════════════════════════
// Lightning cloud — occasionally discharges a downward spark.
// ═══════════════════════════════════════════════════════════════════════

export const lightningCloudBehavior: ElementBehavior = (ctx) => {
  if (ctx.tick % 120 !== 0) return;
  if (ctx.rand() > 0.35) return;
  const sparkId = getIdByKey('spark');
  // Travel a few cells downward, then drop a spark where it first hits matter.
  for (let dy = 1; dy <= 18; dy++) {
    const y = ctx.y + dy;
    if (!ctx.grid.inBounds(ctx.x, y)) return;
    const id = getElement(ctx.grid.get(ctx.x, y));
    if (id !== EMPTY_ID) {
      // One cell above impact, so the spark can ignite / arc.
      const above = y - 1;
      if (ctx.grid.inBounds(ctx.x, above)) {
        const existing = getElement(ctx.grid.get(ctx.x, above));
        if (existing === EMPTY_ID) ctx.grid.set(ctx.x, above, encode(sparkId));
      }
      return;
    }
  }
};

// ═══════════════════════════════════════════════════════════════════════
// Geyser — pumps steam upward every few seconds.
// ═══════════════════════════════════════════════════════════════════════

export const geyserBehavior: ElementBehavior = (ctx) => {
  if (ctx.tick % 80 !== 0) return;
  const steamId = getIdByKey('steam');
  const waterId = getIdByKey('water');
  const above = ctx.y - 1;
  if (!ctx.grid.inBounds(ctx.x, above)) return;
  // Fire a small column of steam topped with water droplets.
  for (let dy = 1; dy <= 6; dy++) {
    const y = ctx.y - dy;
    if (!ctx.grid.inBounds(ctx.x, y)) break;
    if (getElement(ctx.grid.get(ctx.x, y)) !== EMPTY_ID) break;
    if (dy <= 4) {
      ctx.grid.set(ctx.x, y, encode(steamId, 200));
      ctx.field.set(ctx.x, y, 120);
    } else if (ctx.rand() < 0.4) {
      ctx.grid.set(ctx.x, y, encode(waterId));
    }
  }
};

// ═══════════════════════════════════════════════════════════════════════
// Oxygen — fuels fire: extends adjacent fire lifespan.
// ═══════════════════════════════════════════════════════════════════════

export const oxygenBehavior: ElementBehavior = (ctx) => {
  if (ctx.rand() > 0.15) return;
  forEachNeighbor8(ctx, (nx, ny) => {
    if (!ctx.grid.inBounds(nx, ny)) return;
    const cell = ctx.grid.get(nx, ny);
    const nd = getDefinition(getElement(cell));
    if (nd?.key !== 'fire') return;
    // Refresh fire's life byte up to 80 so it burns longer in oxygen-rich air.
    const life = (cell >> 12) & 0xff;
    if (life < 80) {
      const boosted = (cell & ~0x000ff000) | (80 << 12);
      ctx.grid.set(nx, ny, boosted);
    }
    // Oxygen is consumed when feeding fire.
    if (ctx.rand() < 0.3) ctx.grid.set(ctx.x, ctx.y, encode(EMPTY_ID));
  });
};

// ═══════════════════════════════════════════════════════════════════════
// CO2 — smothers adjacent fire, turning it into smoke.
// ═══════════════════════════════════════════════════════════════════════

export const co2Behavior: ElementBehavior = (ctx) => {
  forEachNeighbor8(ctx, (nx, ny) => {
    if (!ctx.grid.inBounds(nx, ny)) return;
    const nd = getDefinition(getElement(ctx.grid.get(nx, ny)));
    if (nd?.key === 'fire' && ctx.rand() < 0.4) {
      ctx.grid.set(nx, ny, encode(getIdByKey('smoke'), 220));
    }
  });
};

// ═══════════════════════════════════════════════════════════════════════
// Chlorine — lethal to organic (plant / seed / mushroom).
// ═══════════════════════════════════════════════════════════════════════

export const chlorineBehavior: ElementBehavior = (ctx) => {
  if (ctx.rand() > 0.12) return;
  forEachNeighbor8(ctx, (nx, ny) => {
    if (!ctx.grid.inBounds(nx, ny)) return;
    const cell = ctx.grid.get(nx, ny);
    const nd = getDefinition(getElement(cell));
    if (!nd) return;
    if (nd.key === 'plant' || nd.key === 'seed' || nd.key === 'mushroom') {
      ctx.grid.set(nx, ny, encode(getIdByKey('ash')));
    }
  });
};

// ═══════════════════════════════════════════════════════════════════════
// Poison — kills organic on contact, spreads slowly through water.
// ═══════════════════════════════════════════════════════════════════════

export const poisonReaction: ElementBehavior = (ctx) => {
  forEachNeighbor8(ctx, (nx, ny) => {
    if (!ctx.grid.inBounds(nx, ny)) return;
    const cell = ctx.grid.get(nx, ny);
    const nd = getDefinition(getElement(cell));
    if (!nd) return;
    if (nd.key === 'plant' || nd.key === 'mushroom' || nd.key === 'seed') {
      if (ctx.rand() < 0.2) ctx.grid.set(nx, ny, encode(getIdByKey('ash')));
    } else if (nd.key === 'water' && ctx.rand() < 0.008) {
      ctx.grid.set(nx, ny, encode(getIdByKey('poison')));
    }
  });
};

// ═══════════════════════════════════════════════════════════════════════
// Mushroom — spreads onto ash / mud / dirt near moisture.
// ═══════════════════════════════════════════════════════════════════════

export const mushroomBehavior: ElementBehavior = (ctx) => {
  if (ctx.rand() > 0.04) return;
  let hasWater = false;
  const targets: Array<[number, number]> = [];
  forEachNeighbor8(ctx, (nx, ny) => {
    if (!ctx.grid.inBounds(nx, ny)) return;
    const nd = getDefinition(getElement(ctx.grid.get(nx, ny)));
    if (!nd) return;
    if (nd.key === 'water') hasWater = true;
    if (nd.key === 'ash' || nd.key === 'mud') targets.push([nx, ny]);
  });
  if (!hasWater || targets.length === 0) return;
  const pick = targets[(ctx.rand() * targets.length) | 0];
  if (pick) ctx.grid.set(pick[0], pick[1], encode(getIdByKey('mushroom')));
};

// ═══════════════════════════════════════════════════════════════════════
// Nanobots — consume a random non-wall neighbour and duplicate into empty.
// ═══════════════════════════════════════════════════════════════════════

export const nanobotBehavior: ElementBehavior = (ctx) => {
  if (ctx.rand() > 0.12) return;
  const selfId = getIdByKey('nanobots');
  const targets: Array<[number, number]> = [];
  const empties: Array<[number, number]> = [];
  forEachNeighbor4(ctx, (nx, ny) => {
    if (!ctx.grid.inBounds(nx, ny)) return;
    const id = getElement(ctx.grid.get(nx, ny));
    if (id === EMPTY_ID) {
      empties.push([nx, ny]);
      return;
    }
    const nd = getDefinition(id);
    if (!nd) return;
    if (
      nd.key === 'wall' ||
      nd.key === 'nanobots' ||
      nd.key === 'antimatter' ||
      nd.key === 'void' ||
      nd.key === 'blackhole'
    )
      return;
    targets.push([nx, ny]);
  });
  if (targets.length > 0) {
    // Consume the neighbour.
    const eat = targets[(ctx.rand() * targets.length) | 0];
    if (eat) ctx.grid.set(eat[0], eat[1], encode(EMPTY_ID));
  }
  if (empties.length > 0 && ctx.rand() < 0.5) {
    // Replicate outward.
    const spawn = empties[(ctx.rand() * empties.length) | 0];
    if (spawn) ctx.grid.set(spawn[0], spawn[1], encode(selfId));
  }
};
