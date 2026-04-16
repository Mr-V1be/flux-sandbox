import {
  ElementBehavior,
  getLife,
  withLife,
  withElement,
  encode,
} from '@/core/types';
import { EMPTY_ID } from '@/core/constants';
import { canDisplace, randomSign } from './helpers';

/**
 * Gas: drifts up and spreads; optionally decays into another element when life expires.
 */
export interface GasOptions {
  density: number;
  /** Probability per tick the gas dies (0..1). */
  decayChance?: number;
  /** If set, the dying gas turns into this element ID instead of disappearing. */
  decayInto?: number;
  /** Horizontal drift range. */
  spread?: number;
}

export const createGasBehavior = (opts: GasOptions): ElementBehavior => {
  const spread = opts.spread ?? 2;
  return (ctx) => {
    const { x, y, grid } = ctx;

    // decay
    if (opts.decayChance && ctx.rand() < opts.decayChance) {
      if (opts.decayInto !== undefined) {
        grid.set(x, y, encode(opts.decayInto));
      } else {
        grid.set(x, y, encode(EMPTY_ID));
      }
      return;
    }

    // rise
    const above = y - 1;
    if (canDisplace(ctx, x, above, opts.density)) {
      grid.swap(x, y, x, above);
      ctx.markUpdated(x, above);
      return;
    }

    // diagonal up
    const dir = randomSign(ctx);
    if (canDisplace(ctx, x + dir, above, opts.density)) {
      grid.swap(x, y, x + dir, above);
      ctx.markUpdated(x + dir, above);
      return;
    }
    if (canDisplace(ctx, x - dir, above, opts.density)) {
      grid.swap(x, y, x - dir, above);
      ctx.markUpdated(x - dir, above);
      return;
    }

    // horizontal drift
    for (let step = 1; step <= spread; step++) {
      const nx = x + dir * step;
      if (!canDisplace(ctx, nx, y, opts.density)) break;
      grid.swap(x, y, nx, y);
      ctx.markUpdated(nx, y);
      return;
    }

    // increment life counter for natural aging
    const life = getLife(ctx.cell);
    if (life < 255) grid.set(x, y, withLife(ctx.cell, life + 1));
    // swallow unused helper to silence linter
    void withElement;
  };
};
