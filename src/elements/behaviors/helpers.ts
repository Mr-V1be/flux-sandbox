import { ElementContext, getElement, ElementDefinition } from '@/core/types';
import { EMPTY_ID } from '@/core/constants';
import { getDefinition } from '../registry';

export const elementAt = (ctx: ElementContext, x: number, y: number): ElementDefinition | null => {
  if (!ctx.grid.inBounds(x, y)) return null;
  const id = getElement(ctx.grid.get(x, y));
  return getDefinition(id);
};

export const isEmpty = (ctx: ElementContext, x: number, y: number): boolean => {
  if (!ctx.grid.inBounds(x, y)) return false;
  return getElement(ctx.grid.get(x, y)) === EMPTY_ID;
};

export const isCategory = (
  ctx: ElementContext,
  x: number,
  y: number,
  category: ElementDefinition['category'],
): boolean => {
  const d = elementAt(ctx, x, y);
  return d !== null && d.category === category;
};

export const isKey = (ctx: ElementContext, x: number, y: number, key: string): boolean => {
  const d = elementAt(ctx, x, y);
  return d !== null && d.key === key;
};

/** Displaces a less-dense cell (liquid through liquid/gas). */
export const canDisplace = (
  ctx: ElementContext,
  x: number,
  y: number,
  myDensity: number,
): boolean => {
  const d = elementAt(ctx, x, y);
  if (!d) return false;
  if (d.category === 'empty') return true;
  if (d.category === 'liquid' || d.category === 'gas') return d.density < myDensity;
  return false;
};

/** Randomly pick -1 or +1. */
export const randomSign = (ctx: ElementContext): -1 | 1 => (ctx.rand() < 0.5 ? -1 : 1);

/** 4-neighborhood visitor. */
export const forEachNeighbor4 = (
  ctx: ElementContext,
  fn: (nx: number, ny: number) => void,
): void => {
  fn(ctx.x - 1, ctx.y);
  fn(ctx.x + 1, ctx.y);
  fn(ctx.x, ctx.y - 1);
  fn(ctx.x, ctx.y + 1);
};

/** 8-neighborhood visitor. */
export const forEachNeighbor8 = (
  ctx: ElementContext,
  fn: (nx: number, ny: number) => void,
): void => {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      fn(ctx.x + dx, ctx.y + dy);
    }
  }
};
