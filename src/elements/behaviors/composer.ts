import { ElementBehavior } from '@/core/types';

/**
 * Compose multiple behaviors in order. Each behavior runs on the same cell;
 * any can mutate the grid. This is the main DRY primitive used to attach
 * chemical reactions on top of a base movement behavior.
 */
export const compose = (...behaviors: Array<ElementBehavior | undefined>): ElementBehavior => {
  const list = behaviors.filter((b): b is ElementBehavior => typeof b === 'function');
  return (ctx) => {
    for (const b of list) b(ctx);
  };
};
