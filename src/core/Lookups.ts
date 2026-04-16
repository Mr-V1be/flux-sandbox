import { ElementDefinition } from './types';

/**
 * Flat typed-array lookup tables indexed by elementId.
 *
 * Purpose: avoid Map.get / object property reads inside per-cell hot loops
 * (thermal diffusion and ThermalEngine run over tens of thousands of cells
 * per tick). Plain TypedArray indexing is ~10x faster than Map.get and
 * keeps the loop monomorphic for V8.
 */

/**
 * Temperature range stored per cell, in °C. The range is wide enough to
 * hold everything from liquid-nitrogen cryo (−196°) up to plasma-hot
 * plasma / nuclear fire (~5000°). All thermal arrays and UI slider
 * clamps read these constants so changing the range here is safe.
 */
export const TEMP_MIN = -273;
export const TEMP_MAX = 5000;

/**
 * Stability cap on a single edge's diffusion coefficient.
 * For 4 neighbours the explicit forward-Euler Laplacian scheme is
 * stable when per-edge k ≤ 0.25. We pick 0.22 for a safe margin.
 */
export const MAX_EDGE_K = 0.22;

/**
 * Clamp on the absolute temperature delta applied to a cell in one
 * tick, after heat-capacity scaling. Bounds the oscillation amplitude
 * on marginally stable combinations (air next to hot metal, …) while
 * still letting a 1000° gradient equilibrate in a handful of ticks.
 */
export const MAX_DELTA_PER_TICK = 600;

export interface ThermalLookups {
  /** Thermal conductivity 0..0.25. */
  conductivity: Float32Array;
  /** Inverse heat capacity (1 / capacity) — used to divide incoming flux. */
  invHeatCapacity: Float32Array;
  /**
   * Precomputed per-pair edge coefficient, indexed by `a * size + b`.
   * Uses harmonic mean (physically correct for series heat transfer)
   * clamped to `MAX_EDGE_K`. Diffusion inner loop does one array read.
   */
  edgeK: Float32Array;
  /** Precomputed side length of edgeK; edgeK[i] covers ids 0..(size-1). */
  edgeKSize: number;
  /** Emit target temp (only valid if hasEmit=1). */
  emitTemp: Int16Array;
  /** How hard emitTemp is applied (0..1). */
  emitStrength: Float32Array;
  hasEmit: Uint8Array;
  /** Ignition threshold. */
  ignitesAt: Int16Array;
  /** Explosion radius on ignition; 0 = none. */
  explodeRadius: Uint8Array;
  hasIgnite: Uint8Array;
  /** Melt (solid→liquid) threshold + target. */
  meltAt: Int16Array;
  meltsInto: Int32Array;
  hasMelt: Uint8Array;
  /** Freeze (liquid→solid) threshold + target. */
  freezeAt: Int16Array;
  freezesInto: Int32Array;
  hasFreeze: Uint8Array;
  /** Boil (liquid→gas) threshold + target. */
  boilAt: Int16Array;
  boilsInto: Int32Array;
  hasBoil: Uint8Array;
  /** Condense (gas→liquid) threshold + target. */
  condenseAt: Int16Array;
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

const clampTemp = (v: number): number =>
  v < TEMP_MIN ? TEMP_MIN : v > TEMP_MAX ? TEMP_MAX : v | 0;

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
  const invHeatCapacity = new Float32Array(size);
  for (let i = 0; i < size; i++) invHeatCapacity[i] = 1.0;
  const emitTemp = new Int16Array(size);
  const emitStrength = new Float32Array(size);
  const hasEmit = new Uint8Array(size);
  const ignitesAt = new Int16Array(size);
  const explodeRadius = new Uint8Array(size);
  const hasIgnite = new Uint8Array(size);
  const meltAt = new Int16Array(size);
  const meltsInto = new Int32Array(size);
  const hasMelt = new Uint8Array(size);
  const freezeAt = new Int16Array(size);
  const freezesInto = new Int32Array(size);
  const hasFreeze = new Uint8Array(size);
  const boilAt = new Int16Array(size);
  const boilsInto = new Int32Array(size);
  const hasBoil = new Uint8Array(size);
  const condenseAt = new Int16Array(size);
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
    if (p.heatCapacity !== undefined && p.heatCapacity > 0) {
      invHeatCapacity[id] = 1 / p.heatCapacity;
    }
    if (p.emitTemp !== undefined) {
      emitTemp[id] = clampTemp(p.emitTemp);
      emitStrength[id] = p.emitStrength ?? 1;
      hasEmit[id] = 1;
    }
    if (p.ignitesAt !== undefined) {
      ignitesAt[id] = clampTemp(p.ignitesAt);
      explodeRadius[id] = p.explodeRadius ?? 0;
      hasIgnite[id] = 1;
    }
    if (p.meltAt !== undefined) {
      meltAt[id] = clampTemp(p.meltAt);
      meltsInto[id] = resolve(p.meltsInto);
      if (meltsInto[id] >= 0) hasMelt[id] = 1;
    }
    if (p.freezeAt !== undefined) {
      freezeAt[id] = clampTemp(p.freezeAt);
      freezesInto[id] = resolve(p.freezesInto);
      if (freezesInto[id] >= 0) hasFreeze[id] = 1;
    }
    if (p.boilAt !== undefined) {
      boilAt[id] = clampTemp(p.boilAt);
      boilsInto[id] = resolve(p.boilsInto);
      if (boilsInto[id] >= 0) hasBoil[id] = 1;
    }
    if (p.condenseAt !== undefined) {
      condenseAt[id] = clampTemp(p.condenseAt);
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

  // Precompute harmonic-mean edge coefficient for every element pair.
  // Formula: k_pair = 2 * k_a * k_b / (k_a + k_b), clamped to MAX_EDGE_K.
  // For two insulators (k≈0) the harmonic mean vanishes → heat cannot cross.
  // For a mix (metal ↔ air), result is bounded by the weaker material.
  const edgeK = new Float32Array(size * size);
  for (let a = 0; a < size; a++) {
    const ka = conductivity[a];
    for (let b = 0; b < size; b++) {
      const kb = conductivity[b];
      const sum = ka + kb;
      let k = sum > 1e-6 ? (2 * ka * kb) / sum : 0;
      if (k > MAX_EDGE_K) k = MAX_EDGE_K;
      edgeK[a * size + b] = k;
    }
  }

  return {
    conductivity,
    invHeatCapacity,
    edgeK,
    edgeKSize: size,
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
