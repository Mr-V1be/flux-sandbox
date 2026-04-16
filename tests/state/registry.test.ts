import { describe, it, expect } from 'vitest';
import { registerAllElements } from '@/elements/definitions';
import {
  getDefinition,
  getDefinitionByKey,
  getIdByKey,
  keyToIdMap,
  listElements,
  registryArray,
} from '@/elements/registry';

// Register once for this test file. The registry is module-global.
registerAllElements();

describe('element registry', () => {
  it('registers the full catalog without duplicate ids or keys', () => {
    const list = listElements();
    expect(list.length).toBeGreaterThan(60);
    const seenIds = new Set<number>();
    const seenKeys = new Set<string>();
    for (const el of list) {
      expect(seenIds.has(el.id)).toBe(false);
      expect(seenKeys.has(el.key)).toBe(false);
      seenIds.add(el.id);
      seenKeys.add(el.key);
    }
  });

  it('registryArray and byKey stay in sync', () => {
    const arr = registryArray();
    const map = keyToIdMap();
    for (const [key, id] of map) {
      expect(arr[id]?.key).toBe(key);
    }
  });

  it('getDefinition / getDefinitionByKey / getIdByKey agree', () => {
    const fireId = getIdByKey('fire');
    expect(getDefinition(fireId)?.key).toBe('fire');
    expect(getDefinitionByKey('fire')?.id).toBe(fireId);
  });

  it('getIdByKey throws on unknown key', () => {
    expect(() => getIdByKey('__nope__')).toThrow();
  });

  it('every definition has a valid category', () => {
    const valid = new Set(['empty', 'solid', 'powder', 'liquid', 'gas', 'special']);
    for (const el of listElements()) {
      expect(valid.has(el.category)).toBe(true);
    }
  });
});
