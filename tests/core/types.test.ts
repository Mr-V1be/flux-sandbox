import { describe, it, expect } from 'vitest';
import {
  encode,
  getElement,
  getLife,
  getVariant,
  isUpdated,
  withElement,
  withLife,
  withVariant,
  withUpdated,
} from '@/core/types';

describe('cell encoding', () => {
  it('round-trips element / life / variant through a single Uint32', () => {
    for (const id of [0, 1, 42, 0xfff]) {
      for (const life of [0, 1, 128, 255]) {
        for (const variant of [0, 1, 200, 255]) {
          const c = encode(id, life, variant);
          expect(getElement(c)).toBe(id);
          expect(getLife(c)).toBe(life);
          expect(getVariant(c)).toBe(variant);
          expect(isUpdated(c)).toBe(false);
        }
      }
    }
  });

  it('clamps element id to 12 bits (mask = 0xfff)', () => {
    const c = encode(0x1234, 0, 0);
    expect(getElement(c)).toBe(0x234);
  });

  it('withElement replaces element id without touching other fields', () => {
    const c = encode(4, 100, 200);
    const u = withElement(c, 7);
    expect(getElement(u)).toBe(7);
    expect(getLife(u)).toBe(100);
    expect(getVariant(u)).toBe(200);
  });

  it('withLife / withVariant preserve other fields', () => {
    const base = encode(3, 10, 20);
    expect(getLife(withLife(base, 99))).toBe(99);
    expect(getElement(withLife(base, 99))).toBe(3);
    expect(getVariant(withVariant(base, 77))).toBe(77);
    expect(getElement(withVariant(base, 77))).toBe(3);
  });

  it('withUpdated toggles the flag bit without corrupting other data', () => {
    const c = encode(5, 40, 80);
    const flagged = withUpdated(c, true);
    expect(isUpdated(flagged)).toBe(true);
    expect(getElement(flagged)).toBe(5);
    expect(getLife(flagged)).toBe(40);
    expect(getVariant(flagged)).toBe(80);
    const unflagged = withUpdated(flagged, false);
    expect(isUpdated(unflagged)).toBe(false);
    expect(getElement(unflagged)).toBe(5);
  });
});
