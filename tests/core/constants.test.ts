import { describe, it, expect } from 'vitest';
import {
  computeGridSize,
  CELL_BUDGET_DESKTOP,
  CELL_BUDGET_MOBILE,
  GRID_STEP,
  MIN_GRID_DIM,
  MAX_GRID_DIM,
} from '@/core/constants';

describe('computeGridSize', () => {
  it('produces chunk-aligned output under the cell budget', () => {
    const { w, h } = computeGridSize(1280, 720, CELL_BUDGET_DESKTOP);
    expect(w % GRID_STEP).toBe(0);
    expect(h % GRID_STEP).toBe(0);
    expect(w * h).toBeLessThanOrEqual(CELL_BUDGET_DESKTOP * 1.2);
  });

  it('matches the viewport aspect ratio roughly', () => {
    const cases = [
      { sw: 1600, sh: 900 },
      { sw: 380, sh: 800 },
      { sw: 2400, sh: 900 },
      { sw: 720, sh: 1280 },
    ];
    for (const { sw, sh } of cases) {
      const { w, h } = computeGridSize(sw, sh, CELL_BUDGET_MOBILE);
      const stageAspect = sw / sh;
      const gridAspect = w / h;
      expect(Math.abs(stageAspect - gridAspect) / stageAspect).toBeLessThan(0.2);
    }
  });

  it('clamps into [MIN_GRID_DIM, MAX_GRID_DIM]', () => {
    const tiny = computeGridSize(50, 50, 1000);
    expect(tiny.w).toBeGreaterThanOrEqual(MIN_GRID_DIM);
    expect(tiny.h).toBeGreaterThanOrEqual(MIN_GRID_DIM);
    const huge = computeGridSize(10_000, 10_000, 10_000_000);
    expect(huge.w).toBeLessThanOrEqual(MAX_GRID_DIM);
    expect(huge.h).toBeLessThanOrEqual(MAX_GRID_DIM);
  });

  it('falls back to defaults when inputs are invalid', () => {
    const a = computeGridSize(0, 100, 1000);
    const b = computeGridSize(100, 0, 1000);
    const c = computeGridSize(100, 100, 0);
    for (const r of [a, b, c]) {
      expect(r.w).toBeGreaterThan(0);
      expect(r.h).toBeGreaterThan(0);
    }
  });
});
