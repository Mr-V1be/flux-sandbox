import {
  ElementBehavior,
  ElementContext,
  encode,
  getElement,
  getLife,
  withLife,
} from '@/core/types';
import { EMPTY_ID } from '@/core/constants';
import { getDefinition, getIdByKey } from '../registry';
import { forEachNeighbor4, forEachNeighbor8 } from './helpers';

/**
 * Reactions are pure functions that inspect neighbors and may transmute cells.
 * They are additive — attached to elements via `compose`.
 */

/** Acid: dissolves adjacent solids/powders (except stone/glass). */
export const acidReaction: ElementBehavior = (ctx) => {
  forEachNeighbor8(ctx, (nx, ny) => {
    if (!ctx.grid.inBounds(nx, ny)) return;
    const nd = getDefinition(getElement(ctx.grid.get(nx, ny)));
    if (!nd) return;
    if (nd.key === 'acid' || nd.key === 'empty') return;
    if (nd.key === 'glass' || nd.key === 'stone' || nd.key === 'wall') return;
    if (nd.category === 'solid' || nd.category === 'powder' || nd.category === 'liquid') {
      if (ctx.rand() < 0.04) {
        // Dissolve the neighbor; consume self sometimes.
        ctx.grid.set(nx, ny, encode(getIdByKey('smoke')));
        if (ctx.rand() < 0.4) ctx.grid.set(ctx.x, ctx.y, encode(EMPTY_ID));
      }
    }
  });
};

/** Lava: ignites flammables, turns sand to glass, cools on contact with water. */
export const lavaReaction: ElementBehavior = (ctx) => {
  forEachNeighbor8(ctx, (nx, ny) => {
    if (!ctx.grid.inBounds(nx, ny)) return;
    const cell = ctx.grid.get(nx, ny);
    const nd = getDefinition(getElement(cell));
    if (!nd) return;

    if (nd.key === 'water') {
      ctx.grid.set(nx, ny, encode(getIdByKey('steam')));
      if (ctx.rand() < 0.5) ctx.grid.set(ctx.x, ctx.y, encode(getIdByKey('stone')));
      return;
    }
    if (nd.key === 'ice') {
      ctx.grid.set(nx, ny, encode(getIdByKey('water')));
      return;
    }
    if (nd.key === 'sand' && ctx.rand() < 0.06) {
      ctx.grid.set(nx, ny, encode(getIdByKey('glass')));
      return;
    }
    if (nd.flammable && ctx.rand() < (nd.burnChance ?? 0.2)) {
      ctx.grid.set(nx, ny, encode(getIdByKey('fire'), 30));
    }
  });
};

/** Fire: spreads to flammables, dies over time, produces smoke. */
export const fireReaction: ElementBehavior = (ctx) => {
  const life = getLife(ctx.cell);

  // Die out
  if (life === 0 || ctx.rand() < 0.02) {
    const above = ctx.y - 1;
    if (ctx.grid.inBounds(above, ctx.y) || ctx.grid.inBounds(ctx.x, above)) {
      // leave smoke occasionally
      if (ctx.rand() < 0.35 && ctx.grid.inBounds(ctx.x, above)) {
        const aboveCell = getElement(ctx.grid.get(ctx.x, above));
        if (aboveCell === EMPTY_ID) {
          ctx.grid.set(ctx.x, above, encode(getIdByKey('smoke'), 200));
        }
      }
    }
    ctx.grid.set(ctx.x, ctx.y, encode(EMPTY_ID));
    return;
  }

  // Age
  ctx.grid.set(ctx.x, ctx.y, withLife(ctx.cell, life - 1));

  // Water/ice extinguish
  forEachNeighbor8(ctx, (nx, ny) => {
    if (!ctx.grid.inBounds(nx, ny)) return;
    const nd = getDefinition(getElement(ctx.grid.get(nx, ny)));
    if (!nd) return;
    if (nd.key === 'water') {
      ctx.grid.set(ctx.x, ctx.y, encode(getIdByKey('steam')));
      return;
    }
    if (nd.flammable && ctx.rand() < (nd.burnChance ?? 0.05)) {
      ctx.grid.set(nx, ny, encode(getIdByKey('fire'), 40));
    }
  });

  // Fire rises
  const above = ctx.y - 1;
  if (ctx.grid.inBounds(ctx.x, above)) {
    const aboveId = getElement(ctx.grid.get(ctx.x, above));
    if (aboveId === EMPTY_ID && ctx.rand() < 0.2) {
      ctx.grid.swap(ctx.x, ctx.y, ctx.x, above);
    }
  }
};

/** Gunpowder/bomb: explodes on heat contact. */
export const explosiveReaction = (radius: number, chance = 1): ElementBehavior => (ctx) => {
  let ignite = false;
  forEachNeighbor8(ctx, (nx, ny) => {
    if (ignite) return;
    if (!ctx.grid.inBounds(nx, ny)) return;
    const nd = getDefinition(getElement(ctx.grid.get(nx, ny)));
    if (!nd) return;
    if (nd.key === 'fire' || nd.key === 'lava' || nd.key === 'spark') ignite = true;
  });
  if (!ignite) return;
  if (ctx.rand() > chance) return;

  explode(ctx, radius);
};

export const explode = (ctx: ElementContext, radius: number): void => {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = ctx.x + dx;
      const ny = ctx.y + dy;
      if (!ctx.grid.inBounds(nx, ny)) continue;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > radius) continue;
      const nd = getDefinition(getElement(ctx.grid.get(nx, ny)));
      if (!nd) continue;
      if (nd.key === 'wall' || nd.key === 'stone') continue;
      if (dist < radius * 0.5) {
        ctx.grid.set(nx, ny, encode(getIdByKey('fire'), 60));
      } else if (ctx.rand() < 0.4) {
        ctx.grid.set(nx, ny, encode(getIdByKey('smoke'), 220));
      } else {
        ctx.grid.set(nx, ny, encode(EMPTY_ID));
      }
    }
  }
};

/** Plant: grows along adjacent water. */
export const plantReaction: ElementBehavior = (ctx) => {
  if (ctx.rand() > 0.08) return;
  forEachNeighbor8(ctx, (nx, ny) => {
    if (!ctx.grid.inBounds(nx, ny)) return;
    const cell = ctx.grid.get(nx, ny);
    const nd = getDefinition(getElement(cell));
    if (nd?.key !== 'water') return;
    ctx.grid.set(nx, ny, encode(getIdByKey('plant')));
  });
};

/** Salt: dissolves in water, melts ice. */
export const saltReaction: ElementBehavior = (ctx) => {
  forEachNeighbor8(ctx, (nx, ny) => {
    if (!ctx.grid.inBounds(nx, ny)) return;
    const nd = getDefinition(getElement(ctx.grid.get(nx, ny)));
    if (!nd) return;
    if (nd.key === 'water' && ctx.rand() < 0.05) {
      ctx.grid.set(ctx.x, ctx.y, encode(EMPTY_ID));
    } else if (nd.key === 'ice' && ctx.rand() < 0.1) {
      ctx.grid.set(nx, ny, encode(getIdByKey('water')));
    }
  });
};

/** Spark: short-lived ignitor. Dies after one tick but triggers explosives, fires, and charges conductors. */
export const sparkReaction: ElementBehavior = (ctx) => {
  forEachNeighbor8(ctx, (nx, ny) => {
    if (!ctx.grid.inBounds(nx, ny)) return;
    const cell = ctx.grid.get(nx, ny);
    const nd = getDefinition(getElement(cell));
    if (!nd) return;
    if (nd.flammable) ctx.grid.set(nx, ny, encode(getIdByKey('fire'), 40));
    if (nd.key === 'copper' || nd.key === 'iron') {
      ctx.grid.set(nx, ny, withLife(cell, 30));
    }
  });
  ctx.grid.set(ctx.x, ctx.y, encode(EMPTY_ID));
};

/** Seed: on wet dirt/water below, turns into plant. Otherwise falls as powder. */
export const seedReaction: ElementBehavior = (ctx) => {
  forEachNeighbor8(ctx, (nx, ny) => {
    if (!ctx.grid.inBounds(nx, ny)) return;
    const nd = getDefinition(getElement(ctx.grid.get(nx, ny)));
    if (nd?.key === 'water' && ctx.rand() < 0.08) {
      ctx.grid.set(ctx.x, ctx.y, encode(getIdByKey('plant')));
    }
  });
};

/** Sand + water contact → mud (added to sand's behavior via compose). */
export const sandWetReaction: ElementBehavior = (ctx) => {
  if (ctx.rand() > 0.003) return;
  forEachNeighbor4(ctx, (nx, ny) => {
    if (!ctx.grid.inBounds(nx, ny)) return;
    const cell = ctx.grid.get(nx, ny);
    const nd = getDefinition(getElement(cell));
    if (nd?.key !== 'water') return;
    ctx.grid.set(nx, ny, encode(getIdByKey('mud')));
    ctx.grid.set(ctx.x, ctx.y, encode(getIdByKey('mud')));
  });
};

/** Virus: infects plants/wood; killed by fire/acid. */
export const virusReaction: ElementBehavior = (ctx) => {
  // die in fire / acid
  let died = false;
  forEachNeighbor8(ctx, (nx, ny) => {
    if (died) return;
    if (!ctx.grid.inBounds(nx, ny)) return;
    const nd = getDefinition(getElement(ctx.grid.get(nx, ny)));
    if (nd?.key === 'fire' && ctx.rand() < 0.3) {
      ctx.grid.set(ctx.x, ctx.y, encode(getIdByKey('ash')));
      died = true;
    }
    if (nd?.key === 'acid' && ctx.rand() < 0.5) {
      ctx.grid.set(ctx.x, ctx.y, encode(EMPTY_ID));
      died = true;
    }
  });
  if (died) return;
  if (ctx.rand() > 0.06) return;
  forEachNeighbor8(ctx, (nx, ny) => {
    if (!ctx.grid.inBounds(nx, ny)) return;
    const cell = ctx.grid.get(nx, ny);
    const nd = getDefinition(getElement(cell));
    if (!nd) return;
    if (nd.key === 'plant' || nd.key === 'wood' || nd.key === 'seed') {
      ctx.grid.set(nx, ny, encode(getIdByKey('virus')));
    }
  });
};

/** Crystal: grows into an empty neighbor when water + salt are both nearby. */
export const crystalReaction: ElementBehavior = (ctx) => {
  if (ctx.rand() > 0.025) return;
  let hasWater = false;
  let hasSalt = false;
  const spots: Array<[number, number]> = [];
  forEachNeighbor8(ctx, (nx, ny) => {
    if (!ctx.grid.inBounds(nx, ny)) return;
    const cell = ctx.grid.get(nx, ny);
    const nd = getDefinition(getElement(cell));
    if (!nd) return;
    if (nd.key === 'water') hasWater = true;
    if (nd.key === 'salt') hasSalt = true;
    if (nd.key === 'empty') spots.push([nx, ny]);
  });
  if (!hasWater || !hasSalt || !spots.length) return;
  const pick = spots[(ctx.rand() * spots.length) | 0];
  if (!pick) return;
  ctx.grid.set(pick[0], pick[1], encode(getIdByKey('crystal')));
};

/**
 * Uranium — radioactive chain-reactor.
 *
 *   - Counts neighboring uranium → adds proportional heat directly to
 *     the thermal field. Clustered uranium runs away to its 100°
 *     ignition threshold → nuclear explosion (handled by thermal engine
 *     via `ignitesAt + explodeRadius` on the profile).
 *   - Corrupts neighboring water → acid, withers plants → ash.
 *   - Occasionally fires a `radiation` projectile in a cardinal direction;
 *     the projectile travels until it hits a living target and mutates it.
 */
export const uraniumReaction: ElementBehavior = (ctx) => {
  let uraniumNeighbors = 0;
  forEachNeighbor8(ctx, (nx, ny) => {
    if (!ctx.grid.inBounds(nx, ny)) return;
    const id = getElement(ctx.grid.get(nx, ny));
    const nd = getDefinition(id);
    if (!nd) return;
    if (nd.key === 'uranium') {
      uraniumNeighbors++;
      return;
    }
    if (nd.key === 'water' && ctx.rand() < 0.02) {
      ctx.grid.set(nx, ny, encode(getIdByKey('acid')));
    } else if (nd.key === 'plant' && ctx.rand() < 0.08) {
      ctx.grid.set(nx, ny, encode(getIdByKey('ash')));
    } else if (nd.key === 'wood' && ctx.rand() < 0.02) {
      ctx.grid.set(nx, ny, encode(getIdByKey('ash')));
    }
  });

  // Chain reaction — each extra uranium neighbor contributes ~3° per tick
  // on top of the base emit. Four+ neighbors triggers runaway → meltdown.
  if (uraniumNeighbors > 0) {
    ctx.field.add(ctx.x, ctx.y, uraniumNeighbors * 3);
  }

  // Emit a directional radiation particle occasionally.
  if (ctx.rand() < 0.018) {
    const dir = (ctx.rand() * 4) | 0; // 0..3 = up/right/down/left
    const dx = dir === 1 ? 1 : dir === 3 ? -1 : 0;
    const dy = dir === 2 ? 1 : dir === 0 ? -1 : 0;
    const tx = ctx.x + dx;
    const ty = ctx.y + dy;
    if (ctx.grid.inBounds(tx, ty) && getElement(ctx.grid.get(tx, ty)) === EMPTY_ID) {
      // life byte = travel range, variant byte = direction code
      ctx.grid.set(tx, ty, encode(getIdByKey('radiation'), 18, dir));
    }
  }
};

/**
 * Radiation projectile — moves in a fixed cardinal direction encoded in
 * the `variant` byte of the cell, decrementing the `life` byte each step.
 * Dies when life hits 0, leaves the grid, or hits any non-empty cell.
 * On organic targets (plant/wood/seed/water/virus) it mutates them.
 */
export const radiationBehavior: ElementBehavior = (ctx) => {
  const life = getLife(ctx.cell);
  if (life <= 0) {
    ctx.grid.set(ctx.x, ctx.y, encode(EMPTY_ID));
    return;
  }

  // Decode direction from variant byte (0..3 mapped to N/E/S/W).
  const dir = (ctx.cell >> 20) & 3;
  const dx = dir === 1 ? 1 : dir === 3 ? -1 : 0;
  const dy = dir === 2 ? 1 : dir === 0 ? -1 : 0;
  const nx = ctx.x + dx;
  const ny = ctx.y + dy;

  if (!ctx.grid.inBounds(nx, ny)) {
    ctx.grid.set(ctx.x, ctx.y, encode(EMPTY_ID));
    return;
  }

  const targetId = getElement(ctx.grid.get(nx, ny));
  if (targetId === EMPTY_ID) {
    // Travel forward, preserving direction + decremented life.
    const carried = (ctx.cell & ~0x000ff000) | ((life - 1) << 12);
    ctx.grid.set(ctx.x, ctx.y, encode(EMPTY_ID));
    ctx.grid.set(nx, ny, carried);
    return;
  }

  // Hit something — mutate organics, otherwise vanish.
  const nd = getDefinition(targetId);
  if (nd) {
    const MUTATE = new Set(['plant', 'wood', 'seed', 'water', 'virus']);
    if (MUTATE.has(nd.key)) {
      const table = ['acid', 'ash', 'virus', 'mud'];
      const pick = table[(ctx.rand() * table.length) | 0]!;
      ctx.grid.set(nx, ny, encode(getIdByKey(pick)));
    }
  }
  ctx.grid.set(ctx.x, ctx.y, encode(EMPTY_ID));
};


