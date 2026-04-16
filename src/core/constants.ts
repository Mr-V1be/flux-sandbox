/** Reserved element IDs. Empty is 0 so a zero-filled grid is "empty". */
export const EMPTY_ID = 0;

export const DEFAULT_WIDTH = 500;
export const DEFAULT_HEIGHT = 320;
export const DEFAULT_CELL_SIZE = 4;

/** Cell-count budgets. The actual grid width/height are derived so the
 * aspect matches the stage while staying under budget. */
export const CELL_BUDGET_DESKTOP = 160_000;
export const CELL_BUDGET_MOBILE = 72_000;

/** Chunk alignment — keep grid dimensions multiples of this. */
export const GRID_STEP = 16;

export const MIN_GRID_DIM = 128;
export const MAX_GRID_DIM = 720;

/**
 * Choose a grid size that matches the stage aspect ratio under a cell-count
 * budget, rounded to chunk-aligned multiples. Falls back to the fixed
 * defaults when the stage is still zero-sized (e.g. during tests).
 */
export function computeGridSize(
  stageWidth: number,
  stageHeight: number,
  budget: number,
): { w: number; h: number } {
  if (stageWidth <= 0 || stageHeight <= 0 || budget <= 0) {
    return { w: DEFAULT_WIDTH, h: DEFAULT_HEIGHT };
  }
  const aspect = stageWidth / stageHeight;
  const rawW = Math.sqrt(budget * aspect);
  const rawH = Math.sqrt(budget / aspect);
  const align = (v: number) => Math.round(v / GRID_STEP) * GRID_STEP;
  const clamp = (v: number) => Math.min(MAX_GRID_DIM, Math.max(MIN_GRID_DIM, v));
  return { w: clamp(align(rawW)), h: clamp(align(rawH)) };
}

export const TARGET_TPS = 60;

/** Ambient empty-cell thermal defaults (used by TemperatureField). */
export const AMBIENT_TEMP = 0;
