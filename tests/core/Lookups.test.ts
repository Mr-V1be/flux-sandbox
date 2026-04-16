import { describe, it, expect } from 'vitest';
import { buildThermalLookups } from '@/core/Lookups';
import { ElementDefinition } from '@/core/types';

const registry: ElementDefinition[] = [];
registry[0] = {
  id: 0, key: 'empty', label: 'E', category: 'empty', color: 0, density: 0,
  thermal: { conductivity: 0.04, emitTemp: 0, emitStrength: 0.03 },
};
registry[1] = {
  id: 1, key: 'ice', label: 'I', category: 'solid', color: 0, density: 80,
  thermal: { conductivity: 0.15, meltAt: 3, meltsInto: 'water', emitTemp: -15, emitStrength: 0.1 },
};
registry[2] = {
  id: 2, key: 'water', label: 'W', category: 'liquid', color: 0, density: 30,
  thermal: { conductivity: 0.1, freezeAt: -5, freezesInto: 'ice', boilAt: 90, boilsInto: 'steam' },
};
registry[3] = {
  id: 3, key: 'steam', label: 'S', category: 'gas', color: 0, density: 3,
  thermal: { conductivity: 0.05, condenseAt: 50, condensesInto: 'water' },
};
registry[4] = {
  id: 4, key: 'gunpowder', label: 'G', category: 'powder', color: 0, density: 55,
  thermal: { conductivity: 0.1, ignitesAt: 50, explodeRadius: 5 },
};
registry[5] = {
  id: 5, key: 'stone', label: 'St', category: 'solid', color: 0, density: 900,
  thermal: { conductivity: 0.1 },
};

describe('buildThermalLookups', () => {
  const lu = buildThermalLookups(registry);

  it('populates conductivity for every registered element', () => {
    expect(lu.conductivity[0]).toBeCloseTo(0.04);
    expect(lu.conductivity[1]).toBeCloseTo(0.15);
    expect(lu.conductivity[4]).toBeCloseTo(0.1);
  });

  it('clamps conductivity to [0, 0.5]', () => {
    const weird: ElementDefinition[] = [];
    weird[0] = {
      id: 0, key: 'empty', label: 'e', category: 'empty', color: 0, density: 0,
    };
    weird[1] = {
      id: 1, key: 'magic', label: 'm', category: 'solid', color: 0, density: 0,
      thermal: { conductivity: 5 },
    };
    const out = buildThermalLookups(weird);
    expect(out.conductivity[1]).toBeLessThanOrEqual(0.5);
  });

  it('flags hasEmit / emitTemp / emitStrength correctly', () => {
    expect(lu.hasEmit[1]).toBe(1);
    expect(lu.emitTemp[1]).toBe(-15);
    expect(lu.emitStrength[1]).toBeCloseTo(0.1);
    expect(lu.hasEmit[2]).toBe(0);
  });

  it('wires melt / freeze / boil / condense targets by key', () => {
    // ice melts → water (id 2)
    expect(lu.hasMelt[1]).toBe(1);
    expect(lu.meltAt[1]).toBe(3);
    expect(lu.meltsInto[1]).toBe(2);
    // water freezes → ice (1), boils → steam (3)
    expect(lu.hasFreeze[2]).toBe(1);
    expect(lu.freezesInto[2]).toBe(1);
    expect(lu.hasBoil[2]).toBe(1);
    expect(lu.boilsInto[2]).toBe(3);
    // steam condenses → water (2)
    expect(lu.hasCondense[3]).toBe(1);
    expect(lu.condensesInto[3]).toBe(2);
  });

  it('ignitesAt + explodeRadius', () => {
    expect(lu.hasIgnite[4]).toBe(1);
    expect(lu.ignitesAt[4]).toBe(50);
    expect(lu.explodeRadius[4]).toBe(5);
  });

  it('needsActive is 1 for emitters and transitioners, 0 for empty and inert', () => {
    expect(lu.needsActive[0]).toBe(0); // empty
    expect(lu.needsActive[1]).toBe(1); // ice emits cold + melts
    expect(lu.needsActive[2]).toBe(1); // water freezes/boils
    expect(lu.needsActive[4]).toBe(1); // gunpowder ignites
    expect(lu.needsActive[5]).toBe(0); // stone has no transitions
  });

  it('hasThermal flags elements with any thermal profile', () => {
    expect(lu.hasThermal[0]).toBe(1);
    expect(lu.hasThermal[1]).toBe(1);
    expect(lu.hasThermal[5]).toBe(1);
  });
});
