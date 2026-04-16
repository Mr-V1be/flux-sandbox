import { ElementDefinition } from '@/core/types';

/**
 * Central element registry.
 *
 * Storage layout:
 *   - `byId` is a plain sparse-safe array indexed by numeric id. This is the
 *     hot-path access — the renderer and behaviours hit `byId[id]` dozens of
 *     times per cell per tick, so it must be an O(1) typed-array access,
 *     NOT a Map.get.
 *   - `byKey` is a Map for keyed lookups (UI, scenarios).
 *   - `ordered` is registration order for deterministic sidebar rendering.
 *
 * Follows open/closed: new elements register themselves; registry is stable.
 */

const byId: ElementDefinition[] = [];
const byKey = new Map<string, ElementDefinition>();
const ordered: ElementDefinition[] = [];

export const registerElement = (def: ElementDefinition): void => {
  if (byId[def.id] !== undefined) throw new Error(`duplicate element id: ${def.id}`);
  if (byKey.has(def.key)) throw new Error(`duplicate element key: ${def.key}`);
  byId[def.id] = def;
  byKey.set(def.key, def);
  ordered.push(def);
};

export const getDefinition = (id: number): ElementDefinition | null => byId[id] ?? null;

export const getIdByKey = (key: string): number => {
  const d = byKey.get(key);
  if (!d) throw new Error(`unknown element key: ${key}`);
  return d.id;
};

export const getDefinitionByKey = (key: string): ElementDefinition | null =>
  byKey.get(key) ?? null;

export const listElements = (): readonly ElementDefinition[] => ordered;

/** Hot-path accessor: O(1) array. Use when iterating many cells. */
export const registryArray = (): readonly ElementDefinition[] =>
  byId as readonly ElementDefinition[];

/** Back-compat: a real Map view. Prefer registryArray in hot loops. */
export const registryMap = (): ReadonlyMap<number, ElementDefinition> => {
  const m = new Map<number, ElementDefinition>();
  for (let i = 0; i < byId.length; i++) {
    const d = byId[i];
    if (d) m.set(i, d);
  }
  return m;
};

/** Key → id lookup map. */
export const keyToIdMap = (): ReadonlyMap<string, number> => {
  const m = new Map<string, number>();
  for (const d of ordered) m.set(d.key, d.id);
  return m;
};
