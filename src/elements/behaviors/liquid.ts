import { ElementBehavior } from '@/core/types';
import { canDisplace, randomSign } from './helpers';

/**
 * Liquid: falls, falls diagonally, then spreads horizontally by `dispersion` cells.
 */
export const createLiquidBehavior = (density: number, dispersion = 5): ElementBehavior => {
  return (ctx) => {
    const { x, y, grid } = ctx;
    const below = y + 1;

    if (canDisplace(ctx, x, below, density)) {
      grid.swap(x, y, x, below);
      ctx.markUpdated(x, below);
      return;
    }

    const dir = randomSign(ctx);
    if (canDisplace(ctx, x + dir, below, density)) {
      grid.swap(x, y, x + dir, below);
      ctx.markUpdated(x + dir, below);
      return;
    }
    if (canDisplace(ctx, x - dir, below, density)) {
      grid.swap(x, y, x - dir, below);
      ctx.markUpdated(x - dir, below);
      return;
    }

    // horizontal spread
    for (let step = 1; step <= dispersion; step++) {
      const nx = x + dir * step;
      if (!canDisplace(ctx, nx, y, density)) break;
      grid.swap(x, y, nx, y);
      ctx.markUpdated(nx, y);
      return;
    }
    for (let step = 1; step <= dispersion; step++) {
      const nx = x - dir * step;
      if (!canDisplace(ctx, nx, y, density)) break;
      grid.swap(x, y, nx, y);
      ctx.markUpdated(nx, y);
      return;
    }
  };
};
