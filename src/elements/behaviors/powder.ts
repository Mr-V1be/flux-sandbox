import { ElementBehavior } from '@/core/types';
import { canDisplace, randomSign } from './helpers';

/**
 * Generic powder: falls straight down, then diagonally.
 * Can sink through liquids/gases of lower density.
 */
export const createPowderBehavior = (density: number): ElementBehavior => {
  return (ctx) => {
    const { x, y, grid } = ctx;
    const below = y + 1;
    if (canDisplace(ctx, x, below, density)) {
      grid.swap(x, y, x, below);
      ctx.markUpdated(x, below);
      return;
    }
    const dir = randomSign(ctx);
    const diag1x = x + dir;
    const diag2x = x - dir;
    if (canDisplace(ctx, diag1x, below, density)) {
      grid.swap(x, y, diag1x, below);
      ctx.markUpdated(diag1x, below);
      return;
    }
    if (canDisplace(ctx, diag2x, below, density)) {
      grid.swap(x, y, diag2x, below);
      ctx.markUpdated(diag2x, below);
    }
  };
};
