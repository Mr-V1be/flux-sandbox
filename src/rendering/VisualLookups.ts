import { ElementDefinition } from '@/core/types';
import { TEMP_MAX, TEMP_MIN } from '@/core/Lookups';

/**
 * Render-only per-element parameters, laid out as flat typed arrays so
 * the inner render loop never has to call `Map.get`.
 *
 * Keep this separate from the thermal simulation lookups: those describe
 * how heat flows (conductivity, phase transitions…), these describe how
 * pixels look — including the black-body-style colour response that
 * makes a cell glow red / white as its temperature rises, and the cold
 * shift that dims it when it freezes.
 */
export interface VisualLookups {
  /** Per-element bloom contribution (0..1). 0 = inert, 1 = fully glowing. */
  bloom: Float32Array;
  /** Cached element ids for the few cells whose bloom scales with charge. */
  copperId: number;
  ironId: number;

  // ── Thermal colour response — hot side (additive glow) ───────────────
  /** Temperature at which the glow ramp starts, in °C. */
  glowStart: Int16Array;
  /** Width of the ramp, in °C. 0 sentinel = element never glows. */
  glowRange: Uint16Array;
  /** Max additive strength (0..1) reached at the end of the ramp. */
  glowStrength: Float32Array;
  glowR: Uint8Array;
  glowG: Uint8Array;
  glowB: Uint8Array;

  // ── Thermal colour response — cold side (blend toward cold colour) ──
  coldStart: Int16Array;
  /** 0 sentinel = element never cold-shifts. */
  coldRange: Uint16Array;
  coldStrength: Float32Array;
  coldR: Uint8Array;
  coldG: Uint8Array;
  coldB: Uint8Array;
}

/**
 * Hand-picked bloom intensities per element.
 * Fire, lava, torch are brightest; crystalline / portal elements get
 * subtle halos. Copper / iron start at 0 and rise dynamically with charge.
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
  antimatter: 0.6,
  ice9: 0.2,
};

/**
 * Hot glow response per element, calibrated on real-world incandescence:
 *   ~500 °C    dark red ("Draper point")
 *   ~800 °C    cherry red
 *   ~1100 °C   orange-yellow
 *   ~1500 °C   yellow-white
 *   ~2500 °C+  blue-white
 *
 *   at       — temperature (°C) where glow begins bleeding in
 *   range    — width of the glow ramp in °C; `norm = (t - at) / range`
 *   color    — RGB tint added (additive blend, clipped at 255)
 *   strength — scales `norm` so the additive term peaks at `strength`
 *              (and up to 1.3x for "over-bright" white-hot core)
 */
interface GlowConfig {
  at: number;
  range: number;
  color: number;
  strength: number;
}

const GLOW_BY_KEY: Record<string, GlowConfig> = {
  // ── metals & conductors ─────────────────────────────────────────────
  copper: { at: 400, range: 900, color: 0xff4020, strength: 0.9 },
  iron: { at: 500, range: 1000, color: 0xff3010, strength: 0.85 },
  mercury: { at: 250, range: 300, color: 0xff5040, strength: 0.6 },
  magnet: { at: 400, range: 800, color: 0xff4020, strength: 0.7 },
  battery: { at: 400, range: 600, color: 0xff4830, strength: 0.5 },
  lightning_rod: { at: 500, range: 800, color: 0xffa020, strength: 0.7 },

  // ── ceramics / glass / rock go red-hot before melting ───────────────
  stone: { at: 500, range: 700, color: 0xc02810, strength: 0.55 },
  obsidian: { at: 600, range: 500, color: 0xa02010, strength: 0.5 },
  glass: { at: 700, range: 600, color: 0xff5820, strength: 0.55 },

  // ── powders near melting / reacting points ──────────────────────────
  sand: { at: 800, range: 700, color: 0xffa030, strength: 0.45 },
  salt: { at: 500, range: 400, color: 0xff8030, strength: 0.35 },
  mud: { at: 80, range: 40, color: 0xff8040, strength: 0.25 },
  ash: { at: 200, range: 250, color: 0xff4020, strength: 0.35 },
  dust: { at: 200, range: 150, color: 0xff8040, strength: 0.3 },

  // ── wood / organic chars before burning ─────────────────────────────
  wood: { at: 250, range: 120, color: 0xff3010, strength: 0.35 },
  coal: { at: 300, range: 200, color: 0xff4520, strength: 0.65 },
  fuse: { at: 150, range: 80, color: 0xff3010, strength: 0.45 },
  plant: { at: 200, range: 80, color: 0xff5030, strength: 0.3 },

  // ── crystalline — subtle whitish halo ───────────────────────────────
  diamond: { at: 400, range: 600, color: 0xfff5e0, strength: 0.35 },
  crystal: { at: 300, range: 500, color: 0xffa0e0, strength: 0.4 },

  // ── reactive pre-ignition heat ──────────────────────────────────────
  uranium: { at: 200, range: 300, color: 0xa0ff80, strength: 0.3 },
  thermite: { at: 400, range: 200, color: 0xff7020, strength: 0.55 },
  gunpowder: { at: 100, range: 80, color: 0xff4020, strength: 0.55 },
  nitro: { at: 150, range: 80, color: 0xff4010, strength: 0.6 },
  bomb: { at: 180, range: 100, color: 0xff4030, strength: 0.55 },

  // ── specialty ───────────────────────────────────────────────────────
  nanobots: { at: 400, range: 400, color: 0xffbb50, strength: 0.5 },
  wax: { at: 50, range: 30, color: 0xffd080, strength: 0.3 },
  waxliq: { at: 80, range: 80, color: 0xffa048, strength: 0.4 },
  ice9: { at: 20, range: 20, color: 0xfff0ff, strength: 0.3 },
  antimatter: { at: 200, range: 400, color: 0xffb0e0, strength: 0.5 },
};

/**
 * Cold response per element: blends toward a darker / bluer tint.
 * Only a handful of materials have distinct sub-zero appearance —
 * everything else just freezes off-colour with no special render.
 */
interface ColdConfig {
  at: number;
  range: number;
  color: number;
  strength: number;
}

const COLD_BY_KEY: Record<string, ColdConfig> = {
  water: { at: -3, range: 30, color: 0x90c4ff, strength: 0.55 },
  mercury: { at: -30, range: 100, color: 0x5070a8, strength: 0.5 },
  stone: { at: -40, range: 120, color: 0x2a3858, strength: 0.45 },
  copper: { at: -40, range: 120, color: 0x704030, strength: 0.35 },
  iron: { at: -40, range: 120, color: 0x505a70, strength: 0.35 },
  sand: { at: -40, range: 120, color: 0x8a7a5e, strength: 0.25 },
  wood: { at: -40, range: 120, color: 0x5a3a1e, strength: 0.3 },
  mushroom: { at: -20, range: 60, color: 0x88506a, strength: 0.4 },
  plant: { at: -10, range: 40, color: 0x2d7450, strength: 0.4 },
};

export function buildVisualLookups(
  registry: readonly ElementDefinition[],
): VisualLookups {
  const size = registry.length;
  const bloom = new Float32Array(size);
  const glowStart = new Int16Array(size);
  const glowRange = new Uint16Array(size);
  const glowStrength = new Float32Array(size);
  const glowR = new Uint8Array(size);
  const glowG = new Uint8Array(size);
  const glowB = new Uint8Array(size);
  const coldStart = new Int16Array(size);
  const coldRange = new Uint16Array(size);
  const coldStrength = new Float32Array(size);
  const coldR = new Uint8Array(size);
  const coldG = new Uint8Array(size);
  const coldB = new Uint8Array(size);

  let copperId = -1;
  let ironId = -1;
  for (let i = 0; i < size; i++) {
    const def = registry[i];
    if (!def) continue;
    bloom[i] = BLOOM_BY_KEY[def.key] ?? 0;
    if (def.key === 'copper') copperId = i;
    if (def.key === 'iron') ironId = i;

    const g = GLOW_BY_KEY[def.key];
    if (g) {
      glowStart[i] = clampTemp(g.at);
      glowRange[i] = clampU16(g.range);
      glowStrength[i] = g.strength;
      glowR[i] = (g.color >> 16) & 0xff;
      glowG[i] = (g.color >> 8) & 0xff;
      glowB[i] = g.color & 0xff;
    }
    // range = 0 is the "never glows" sentinel.

    const c = COLD_BY_KEY[def.key];
    if (c) {
      coldStart[i] = clampTemp(c.at);
      coldRange[i] = clampU16(c.range);
      coldStrength[i] = c.strength;
      coldR[i] = (c.color >> 16) & 0xff;
      coldG[i] = (c.color >> 8) & 0xff;
      coldB[i] = c.color & 0xff;
    }
  }

  return {
    bloom,
    copperId,
    ironId,
    glowStart,
    glowRange,
    glowStrength,
    glowR,
    glowG,
    glowB,
    coldStart,
    coldRange,
    coldStrength,
    coldR,
    coldG,
    coldB,
  };
}

const clampTemp = (v: number): number =>
  v < TEMP_MIN ? TEMP_MIN : v > TEMP_MAX ? TEMP_MAX : v | 0;
const clampU16 = (v: number): number => (v < 0 ? 0 : v > 65535 ? 65535 : v | 0);
