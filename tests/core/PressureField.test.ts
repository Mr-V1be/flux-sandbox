import { describe, it, expect } from 'vitest';
import { PressureField, PRESSURE_MAX, PRESSURE_MIN } from '@/core/PressureField';
import { Grid } from '@/core/Grid';
import { ElementDefinition, encode } from '@/core/types';

const makeRegistry = (): ElementDefinition[] => {
  const defs: ElementDefinition[] = [];
  defs[0] = {
    id: 0, key: 'empty', label: 'Empty', category: 'empty', color: 0, density: 0,
    thermal: { conductivity: 0.04 },
  };
  defs[1] = {
    id: 1, key: 'wall', label: 'Wall', category: 'solid', color: 0x111111, density: 1000,
    thermal: { conductivity: 0.002 },
  };
  defs[2] = {
    id: 2, key: 'sand', label: 'Sand', category: 'powder', color: 0xe5c47a, density: 60,
    thermal: { conductivity: 0.03 },
  };
  return defs;
};

describe('PressureField', () => {
  it('set() clamps into the Int16 Pa range', () => {
    const reg = makeRegistry();
    const pf = new PressureField(4, 4, reg);
    pf.set(0, 0, 999_999);
    expect(pf.get(0, 0)).toBe(PRESSURE_MAX);
    pf.set(1, 0, -999_999);
    expect(pf.get(1, 0)).toBe(PRESSURE_MIN);
  });

  it('pulse() deposits peak pressure at the centre and less at the edge', () => {
    const reg = makeRegistry();
    const pf = new PressureField(32, 32, reg);
    pf.pulse(16, 16, 8, 4000);
    const centre = pf.get(16, 16);
    const mid = pf.get(16, 20);
    const outside = pf.get(16, 28);
    expect(centre).toBeGreaterThan(3500);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(centre);
    expect(outside).toBe(0);
  });

  it('diffuse() spreads pressure into an empty neighbour', () => {
    const reg = makeRegistry();
    const grid = new Grid(16, 16, 16);
    const pf = new PressureField(16, 16, reg);
    // Seed a spike — every cell is already empty.
    pf.set(8, 8, 4000);
    grid.wakeAll();
    grid.swapActivity();
    for (let t = 0; t < 8; t++) pf.diffuse(grid);
    expect(pf.get(8, 8)).toBeLessThan(4000);
    expect(pf.get(9, 8)).toBeGreaterThan(50);
  });

  it('diffuse() is blocked by a wall wrapper', () => {
    const reg = makeRegistry();
    const grid = new Grid(16, 16, 16);
    // Ring of walls around a single empty cell at (8,8).
    const wallId = 1;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        grid.set(8 + dx, 8 + dy, encode(wallId));
      }
    }
    const pf = new PressureField(16, 16, reg);
    pf.set(8, 8, 4000);
    grid.wakeAll();
    grid.swapActivity();
    for (let t = 0; t < 8; t++) pf.diffuse(grid);
    // The spike decays slightly but walls keep most of it inside the pocket.
    expect(pf.get(8, 8)).toBeGreaterThan(3000);
    // The far side of the wall ring stays quiet.
    expect(Math.abs(pf.get(10, 8))).toBeLessThan(40);
  });

  it('advect() pushes a movable cell toward the lowest-pressure neighbour', () => {
    const reg = makeRegistry();
    const grid = new Grid(16, 16, 16);
    const sandId = 2;
    // Sand at (8, 8) with high pressure. Neighbours west/north/south are
    // at half the pressure (still overpressure), only east is truly quiet
    // so the gradient points east unambiguously.
    grid.set(8, 8, encode(sandId));
    grid.wakeAll();
    grid.swapActivity();
    const pf = new PressureField(16, 16, reg);
    pf.set(8, 8, 4000);
    pf.set(7, 8, 2000);
    pf.set(8, 7, 2000);
    pf.set(8, 9, 2000);
    pf.advect(grid);
    expect(grid.get(8, 8) & 0xfff).toBe(0);
    expect(grid.get(9, 8) & 0xfff).toBe(sandId);
  });
});
