import { ElementDefinition } from './types';

/**
 * Flat typed-array lookup tables indexed by elementId.
 *
 * Purpose: avoid Map.get / object property reads inside per-cell hot loops
 * (thermal diffusion and ThermalEngine run over tens of thousands of cells
 * per tick). Plain TypedArray indexing is ~10x faster than Map.get and
 * keeps the loop monomorphic for V8.
 */

const NO_SENTINEL = 0;

export interface ThermalLookups {
  /** Thermal conductivity 0..0.5. */
  conductivity: Float32Array;
  /** Emit target temp (only valid if hasEmit=1). */
  emitTemp: Int8Array;
  /** How hard emitTemp is applied (0..1). */
  emitStrength: Float32Array;
  hasEmit: Uint8Array;
  /** Ignition threshold. */
  ignitesAt: Int8Array;
  /** Explosion radius on ignition; 0 = none. */
  explodeRadius: Uint8Array;
  hasIgnite: Uint8Array;
  /** Melt (solid→liquid) threshold + target. */
  meltAt: Int8Array;
  meltsInto: Int32Array;
  hasMelt: Uint8Array;
  /** Freeze (liquid→solid) threshold + target. */
  freezeAt: Int8Array;
  freezesInto: Int32Array;
  hasFreeze: Uint8Array;
  /** Boil (liquid→gas) threshold + target. */
  boilAt: Int8Array;
  boilsInto: Int32Array;
  hasBoil: Uint8Array;
  /** Condense (gas→liquid) threshold + target. */
  condenseAt: Int8Array;
  condensesInto: Int32Array;
  hasCondense: Uint8Array;
  /** Set true if the element has any thermal profile at all. */
  hasThermal: Uint8Array;
  /**
   * Set true if the element's chunk must stay active every tick to keep
   * thermal simulation going (emitters + anything with a transition).
   * Solid-inert elements (stone, glass, wall) do NOT set this — their
   * chunks can go to sleep once they cool.
   */
  needsActive: Uint8Array;
}

export const buildThermalLookups = (
  registry: readonly ElementDefinition[],
): ThermalLookups => {
  const keyToId = new Map<string, number>();
  let maxId = 0;
  for (let i = 0; i < registry.length; i++) {
    const def = registry[i];
    if (!def) continue;
    if (i > maxId) maxId = i;
    keyToId.set(def.key, i);
  }
  const size = maxId + 1;

  const conductivity = new Float32Array(size);
  const emitTemp = new Int8Array(size);
  const emitStrength = new Float32Array(size);
  const hasEmit = new Uint8Array(size);
  const ignitesAt = new Int8Array(size);
  const explodeRadius = new Uint8Array(size);
  const hasIgnite = new Uint8Array(size);
  const meltAt = new Int8Array(size);
  const meltsInto = new Int32Array(size);
  const hasMelt = new Uint8Array(size);
  const freezeAt = new Int8Array(size);
  const freezesInto = new Int32Array(size);
  const hasFreeze = new Uint8Array(size);
  const boilAt = new Int8Array(size);
  const boilsInto = new Int32Array(size);
  const hasBoil = new Uint8Array(size);
  const condenseAt = new Int8Array(size);
  const condensesInto = new Int32Array(size);
  const hasCondense = new Uint8Array(size);
  const hasThermal = new Uint8Array(size);
  const needsActive = new Uint8Array(size);

  const resolve = (key: string | undefined): number => {
    if (!key) return -1;
    const id = keyToId.get(key);
    return id ?? -1;
  };

  for (let id = 0; id < registry.length; id++) {
    const def = registry[id];
    if (!def) continue;
    const p = def.thermal;
    if (!p) {
      conductivity[id] = 0.02;
      continue;
    }
    hasThermal[id] = 1;
    conductivity[id] = clamp(p.conductivity, 0, 0.5);
    if (p.emitTemp !== undefined) {
      emitTemp[id] = p.emitTemp;
      emitStrength[id] = p.emitStrength ?? 1;
      hasEmit[id] = 1;
    }
    if (p.ignitesAt !== undefined) {
      ignitesAt[id] = p.ignitesAt;
      explodeRadius[id] = p.explodeRadius ?? 0;
      hasIgnite[id] = 1;
    }
    if (p.meltAt !== undefined) {
      meltAt[id] = p.meltAt;
      meltsInto[id] = resolve(p.meltsInto);
      if (meltsInto[id] >= 0) hasMelt[id] = 1;
    }
    if (p.freezeAt !== undefined) {
      freezeAt[id] = p.freezeAt;
      freezesInto[id] = resolve(p.freezesInto);
      if (freezesInto[id] >= 0) hasFreeze[id] = 1;
    }
    if (p.boilAt !== undefined) {
      boilAt[id] = p.boilAt;
      boilsInto[id] = resolve(p.boilsInto);
      if (boilsInto[id] >= 0) hasBoil[id] = 1;
    }
    if (p.condenseAt !== undefined) {
      condenseAt[id] = p.condenseAt;
      condensesInto[id] = resolve(p.condensesInto);
      if (condensesInto[id] >= 0) hasCondense[id] = 1;
    }
    // Empty participates passively in diffusion only; don't mark it as needing active chunks.
    if (def.key !== 'empty') {
      if (
        hasEmit[id] ||
        hasIgnite[id] ||
        hasMelt[id] ||
        hasFreeze[id] ||
        hasBoil[id] ||
        hasCondense[id]
      ) {
        needsActive[id] = 1;
      }
    }
  }

  void NO_SENTINEL;

  return {
    conductivity,
    emitTemp,
    emitStrength,
    hasEmit,
    ignitesAt,
    explodeRadius,
    hasIgnite,
    meltAt,
    meltsInto,
    hasMelt,
    freezeAt,
    freezesInto,
    hasFreeze,
    boilAt,
    boilsInto,
    hasBoil,
    condenseAt,
    condensesInto,
    hasCondense,
    hasThermal,
    needsActive,
  };
};

const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;
