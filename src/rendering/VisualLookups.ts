import { ElementDefinition } from '@/core/types';

/**
 * Render-only per-element parameters, laid out as flat typed arrays so
 * the inner render loop never has to call `Map.get`.
 *
 * Keep this separate from the thermal lookups: those describe the
 * simulation (conductivity, phase transitions…), these describe pixels.
 */
export interface VisualLookups {
  /** Per-element bloom contribution (0..1). 0 = inert, 1 = fully glowing. */
  bloom: Float32Array;
  /** Cached element ids for the handful of cells that bloom based on
   *  their life byte (copper / iron charge) rather than a static value. */
  copperId: number;
  ironId: number;
}

/**
 * Hand-picked brightness contributions. Keyed by element `key`, not id,
 * so adding / renaming elements won't silently break the glow.
 */
const BLOOM_BY_KEY: Record<string, number> = {
  fire: 0.95,
  lava: 0.55,
  torch: 0.85,
  spark: 1.0,
  radiation: 0.7,
  uranium: 0.35,
  crystal: 0.2,
  portal_a: 0.4,
  portal_b: 0.4,
  lightning_rod: 0.15,
  thermite: 0.3,
};

export function buildVisualLookups(
  registry: readonly ElementDefinition[],
): VisualLookups {
  const size = registry.length;
  const bloom = new Float32Array(size);
  let copperId = -1;
  let ironId = -1;
  for (let i = 0; i < size; i++) {
    const def = registry[i];
    if (!def) continue;
    bloom[i] = BLOOM_BY_KEY[def.key] ?? 0;
    if (def.key === 'copper') copperId = i;
    if (def.key === 'iron') ironId = i;
  }
  return { bloom, copperId, ironId };
}
