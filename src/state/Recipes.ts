import { ElementDefinition } from '@/core/types';
import { getDefinitionByKey, listElements } from '@/elements/registry';

/**
 * Recipe strings shown on hover of an element.
 *
 * Built lazily by composing three sources:
 *   1. Thermal profile → auto-derived lines ("melts above 3° → Water").
 *   2. Neighbor-heat implications ("heats Water → Steam").
 *   3. A hand-annotated catalog for element-specific chemistry.
 *
 * This keeps the presentation layer (Sidebar) a pure consumer — it just
 * asks `recipesFor(key)` and renders.
 */

type Catalog = Record<string, string[]>;

/** Hand-written reactions that aren't fully captured by the thermal model. */
const CHEMISTRY: Catalog = {
  lava: ['+ Water → Stone + Steam', '+ Sand → Glass', '+ Ice → Water'],
  acid: ['Dissolves most solids (except Stone / Glass / Wall)'],
  water: ['+ Sand → Mud', 'Feeds Plants'],
  fire: ['+ Water → Steam', 'Leaves Smoke as it burns out'],
  plant: ['Grows along Water', 'Ignites easily'],
  salt: ['Dissolves in Water', 'Melts Ice'],
  sand: ['+ Water → Mud', '+ Lava → Glass'],
  seed: ['+ Water → Plant'],
  crystal: ['Grows where Salt meets Water'],
  uranium: [
    'Clusters chain-react and detonate at 100°',
    '+ Water → Acid (slow)',
    '+ Plant / Wood → Ash',
    'Emits Radiation projectiles',
  ],
  radiation: ['Mutates Plant / Wood / Water / Seed / Virus on impact'],
  virus: ['Infects Plant / Wood / Seed', 'Killed by Fire or Acid'],
  spark: ['Ignites flammables', 'Charges Copper / Iron'],
  battery: ['Pulses charge into adjacent Copper / Iron'],
  copper: ['Conducts spark through the wire', 'Detonates adjacent explosives'],
  iron: ['Conducts electricity', 'Attracted by Magnets'],
  magnet: ['Pulls Iron toward itself'],
  cloner: ['Duplicates the material adjacent to it'],
  void: ['Deletes any adjacent cell'],
  torch: ['Persistent 120° heat source', 'Melts Ice / Snow, ignites flammables'],
  fan: ['Blows particles above it upward'],
  blackhole: ['Pulls everything nearby inward; annihilates at the center'],
  portal_a: ['Paired with Portal B — swaps adjacent cells between them'],
  portal_b: ['Paired with Portal A — swaps adjacent cells between them'],
  antigravity: ['Column of cells above is lifted upward'],
  lightning_rod: ['Fires a vertical bolt of sparks from the sky'],
  foam: ['Floats on Water', 'Pops above 60°'],
  glue: ['Pins adjacent powder / liquid in place'],
  nitro: ['Detonates above 25° (massive blast)'],
  gunpowder: ['Detonates above 50°'],
  bomb: ['Detonates above 40°'],
  gas: ['Detonates above 30°'],
  methane: ['Detonates above 25°'],
  oil: ['Auto-ignites above 55°', 'Floats on water'],
  napalm: ['Sticky fire-liquid, ignites at 45°'],
  mercury: ['Heavy silver liquid — sinks through most things'],
  honey: ['Barely flows', 'Caramelizes above 85°'],
  snow: ['Melts above 1° → Water'],
  mud: ['Dries above 45° → Sand'],
  ice: ['Melts above 3° → Water'],
  steam: ['Condenses below 50° → Water'],
  cryo: ['Liquid nitrogen (–80°). Freezes almost anything.'],
  thermite: ['Ignites at 70°, burns hotter than most fuels'],
  // new content:
  oxygen: ['Extends adjacent Fire lifespan', 'Consumed while burning'],
  co2: ['Smothers adjacent Fire into Smoke'],
  chlorine: ['Kills Plant / Seed / Mushroom'],
  helium: ['Rises faster than any other gas'],
  antimatter: ['Annihilates adjacent matter (except walls)', 'Leaves fire + heat at the impact'],
  ice9: ['Crystallises any adjacent Water', 'Melts above 20°'],
  lightningcloud: ['Drifts like gas', 'Discharges a spark downward every ~2 seconds'],
  mushroom: ['Grows on Ash / Mud when Water is nearby', 'Flammable'],
  nanobots: ['Consume a random neighbour', 'Replicate into empty space'],
  tar: ['Heavy liquid', 'Burns slow and hot'],
  poison: ['Kills Plant / Seed / Mushroom', 'Slowly contaminates Water'],
  rubber: ['Very low heat conductivity', 'Burns slowly'],
  geyser: ['Erupts Steam + Water upward every ~1.3 seconds'],
  obsidian: ['Inert volcanic glass'],
  diamond: ['Resists everything'],
  wax: ['Melts above 50° → Wax Liquid'],
  waxliq: ['Hardens below 30° → Wax'],
  wick: ['Wick burns steadily once lit'],
  gas_: [],
};

/** Convert a snake_case or lowercase element key into a human label. */
const elementLabel = (key: string): string => {
  const def = getDefinitionByKey(key);
  return def?.label ?? key;
};

const thermalLines = (def: ElementDefinition): string[] => {
  const p = def.thermal;
  if (!p) return [];
  const out: string[] = [];
  if (p.emitTemp !== undefined) {
    if (p.emitTemp >= 40) out.push(`Heat source (~${p.emitTemp}°)`);
    else if (p.emitTemp <= -10) out.push(`Cold source (~${p.emitTemp}°)`);
  }
  if (p.meltAt !== undefined && p.meltsInto) {
    out.push(`Melts above ${p.meltAt}° → ${elementLabel(p.meltsInto)}`);
  }
  if (p.freezeAt !== undefined && p.freezesInto) {
    out.push(`Freezes below ${p.freezeAt}° → ${elementLabel(p.freezesInto)}`);
  }
  if (p.boilAt !== undefined && p.boilsInto) {
    out.push(`Boils above ${p.boilAt}° → ${elementLabel(p.boilsInto)}`);
  }
  if (p.condenseAt !== undefined && p.condensesInto) {
    out.push(`Condenses below ${p.condenseAt}° → ${elementLabel(p.condensesInto)}`);
  }
  if (p.ignitesAt !== undefined) {
    if (p.explodeRadius && p.explodeRadius > 0) {
      out.push(`Detonates at ${p.ignitesAt}° (radius ${p.explodeRadius})`);
    } else {
      out.push(`Ignites above ${p.ignitesAt}° → Fire`);
    }
  }
  return out;
};

/** Auto-derive "heats X → Y" lines by comparing emitters to receivers. */
const neighborLines = (def: ElementDefinition): string[] => {
  const emit = def.thermal?.emitTemp;
  if (emit === undefined) return [];
  const out: string[] = [];
  const seen = new Set<string>();

  for (const other of listElements()) {
    if (other.key === def.key) continue;
    const p = other.thermal;
    if (!p) continue;
    if (emit >= 40 && p.meltAt !== undefined && emit >= p.meltAt && p.meltsInto) {
      const line = `Melts ${other.label} → ${elementLabel(p.meltsInto)}`;
      if (!seen.has(line)) { out.push(line); seen.add(line); }
    }
    if (emit >= 40 && p.boilAt !== undefined && emit >= p.boilAt && p.boilsInto) {
      const line = `Boils ${other.label} → ${elementLabel(p.boilsInto)}`;
      if (!seen.has(line)) { out.push(line); seen.add(line); }
    }
    if (emit >= 40 && p.ignitesAt !== undefined && emit >= p.ignitesAt) {
      const line = p.explodeRadius ? `Detonates ${other.label}` : `Ignites ${other.label}`;
      if (!seen.has(line)) { out.push(line); seen.add(line); }
    }
    if (emit <= -10 && p.freezeAt !== undefined && emit <= p.freezeAt && p.freezesInto) {
      const line = `Freezes ${other.label} → ${elementLabel(p.freezesInto)}`;
      if (!seen.has(line)) { out.push(line); seen.add(line); }
    }
    if (emit <= 50 && p.condenseAt !== undefined && emit <= p.condenseAt && p.condensesInto) {
      const line = `Condenses ${other.label} → ${elementLabel(p.condensesInto)}`;
      if (!seen.has(line)) { out.push(line); seen.add(line); }
    }
  }
  return out.slice(0, 3);
};

/** Merge sources and dedupe; cap to a reasonable length. */
export const recipesFor = (key: string): string[] => {
  const def = getDefinitionByKey(key);
  if (!def) return [];
  const chem = CHEMISTRY[key] ?? [];
  const thermal = thermalLines(def);
  const neighbor = neighborLines(def);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of [...chem, ...thermal, ...neighbor]) {
    if (seen.has(line)) continue;
    seen.add(line);
    out.push(line);
    if (out.length >= 7) break;
  }
  return out;
};
