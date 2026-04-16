import { describe, it, expect } from 'vitest';
import { TemperatureField } from '@/core/TemperatureField';
import { Grid } from '@/core/Grid';
import { buildThermalLookups } from '@/core/Lookups';
import { ElementDefinition, encode } from '@/core/types';

/**
 * Assemble a tiny hand-rolled element registry so tests stay isolated
 * from the full application catalog.
 */
const makeRegistry = (): ElementDefinition[] => {
  const defs: ElementDefinition[] = [];
  defs[0] = {
    id: 0, key: 'empty', label: 'Empty', category: 'empty', color: 0, density: 0,
    thermal: { conductivity: 0.04, emitTemp: 0, emitStrength: 0.05 },
  };
  defs[1] = {
    id: 1, key: 'heater', label: 'Heater', category: 'solid', color: 0xff0000, density: 900,
    thermal: { conductivity: 0.25, emitTemp: 100, emitStrength: 0.5 },
  };
  defs[2] = {
    id: 2, key: 'stone', label: 'Stone', category: 'solid', color: 0x777777, density: 900,
    thermal: { conductivity: 0.1 },
  };
  defs[3] = {
    id: 3, key: 'ice', label: 'Ice', category: 'solid', color: 0xaedcff, density: 80,
    thermal: { conductivity: 0.15, meltAt: 2, meltsInto: 'water' },
  };
  defs[4] = {
    id: 4, key: 'water', label: 'Water', category: 'liquid', color: 0x4aa3ff, density: 30,
    thermal: { conductivity: 0.1, freezeAt: -5, freezesInto: 'ice' },
  };
  return defs;
};

describe('TemperatureField', () => {
  it('diffuses heat from an emitter toward an adjacent empty cell', () => {
    const reg = makeRegistry();
    const lu = buildThermalLookups(reg);
    const grid = new Grid(16, 16, 16);
    const field = new TemperatureField(16, 16);

    grid.set(5, 5, encode(1)); // heater
    grid.swapActivity();

    for (let i = 0; i < 30; i++) {
      field.diffuse(grid, lu);
    }
    const hot = field.get(5, 5);
    const adj = field.get(6, 5);
    expect(hot).toBeGreaterThan(80); // near emit target
    expect(adj).toBeGreaterThan(0); // heat has spread
    expect(adj).toBeLessThan(hot);
  });

  it('pulls inactive-chunk temperatures toward zero via the empty emitter', () => {
    const reg = makeRegistry();
    const lu = buildThermalLookups(reg);
    const grid = new Grid(16, 16, 16);
    const field = new TemperatureField(16, 16);

    field.set(8, 8, 50);
    grid.set(8, 8, encode(0));
    grid.swapActivity();

    for (let i = 0; i < 100; i++) field.diffuse(grid, lu);
    expect(Math.abs(field.get(8, 8))).toBeLessThan(10); // decays toward ambient 0
  });

  it('set() clamps to the TEMP_MIN/TEMP_MAX range', () => {
    const field = new TemperatureField(4, 4);
    field.set(0, 0, 9999);
    expect(field.get(0, 0)).toBe(5000);
    field.set(1, 0, -9999);
    expect(field.get(1, 0)).toBe(-273);
  });

  it('add() accumulates and clamps', () => {
    const field = new TemperatureField(4, 4);
    field.set(0, 0, 4800);
    field.add(0, 0, 400);
    expect(field.get(0, 0)).toBe(5000);
    field.add(0, 0, -10_000);
    expect(field.get(0, 0)).toBe(-273);
  });

  it('clear() zeroes everything', () => {
    const field = new TemperatureField(4, 4);
    field.set(0, 0, 50);
    field.set(3, 3, -30);
    field.clear();
    expect(field.get(0, 0)).toBe(0);
    expect(field.get(3, 3)).toBe(0);
  });
});
