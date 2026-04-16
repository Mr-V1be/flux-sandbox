import { describe, it, expect } from 'vitest';
import { Grid } from '@/core/Grid';
import { encode, getElement, isUpdated } from '@/core/types';

describe('Grid', () => {
  it('initialises chunked activity with the correct dimensions', () => {
    const g = new Grid(100, 64, 16);
    expect(g.chunksX).toBe(Math.ceil(100 / 16));
    expect(g.chunksY).toBe(Math.ceil(64 / 16));
    expect(g.cells.length).toBe(100 * 64);
  });

  it('set() wakes a 3×3 block of chunks around the written cell', () => {
    const g = new Grid(64, 64, 16);
    g.set(32, 32, encode(1));
    g.swapActivity();
    // The written cell is in chunk (2,2); its 3×3 neighbourhood is (1..3, 1..3)
    for (let cy = 1; cy <= 3; cy++) {
      for (let cx = 1; cx <= 3; cx++) {
        expect(g.isChunkActive(cx, cy)).toBe(true);
      }
    }
    expect(g.isChunkActive(0, 0)).toBe(false);
  });

  it('setSilent() does NOT wake chunks', () => {
    const g = new Grid(64, 64, 16);
    g.setSilent(32, 32, encode(1));
    g.swapActivity();
    expect(g.isChunkActive(2, 2)).toBe(false);
  });

  it('swap() wakes both endpoints', () => {
    const g = new Grid(64, 64, 16);
    g.setSilent(0, 0, encode(1));
    g.setSilent(63, 63, encode(2));
    g.swap(0, 0, 63, 63);
    g.swapActivity();
    expect(g.isChunkActive(0, 0)).toBe(true);
    expect(g.isChunkActive(3, 3)).toBe(true);
    expect(getElement(g.get(0, 0))).toBe(2);
    expect(getElement(g.get(63, 63))).toBe(1);
  });

  it('swap() also moves temperatures when a field is linked', () => {
    const g = new Grid(8, 8, 4);
    const field = { temps: new Int8Array(8 * 8) };
    field.temps[g.index(0, 0)] = -100;
    field.temps[g.index(7, 7)] = 50;
    g.linkField(field);
    g.setSilent(0, 0, encode(1));
    g.setSilent(7, 7, encode(2));
    g.swap(0, 0, 7, 7);
    expect(field.temps[g.index(0, 0)]).toBe(50);
    expect(field.temps[g.index(7, 7)]).toBe(-100);
  });

  it('swap() leaves temperatures alone when no field is linked', () => {
    const g = new Grid(4, 4, 4);
    g.setSilent(0, 0, encode(1));
    g.setSilent(3, 3, encode(2));
    // should not throw
    expect(() => g.swap(0, 0, 3, 3)).not.toThrow();
  });

  it('clear() empties cells and wakes every chunk next tick', () => {
    const g = new Grid(48, 48, 16);
    g.set(10, 10, encode(1));
    g.set(40, 40, encode(2));
    g.clear();
    g.swapActivity();
    expect(getElement(g.get(10, 10))).toBe(0);
    for (let cy = 0; cy < g.chunksY; cy++) {
      for (let cx = 0; cx < g.chunksX; cx++) {
        expect(g.isChunkActive(cx, cy)).toBe(true);
      }
    }
  });

  it('resetUpdatedFlags() only touches cells inside active chunks', () => {
    const g = new Grid(48, 48, 16);
    // Prepare: write a cell in an inactive chunk (bit-set the flag directly).
    g.cells[g.index(1, 1)] = (1 << 28) | encode(1);
    // And another in a chunk we'll wake explicitly.
    g.cells[g.index(40, 40)] = (1 << 28) | encode(2);
    g.wake(40, 40);
    g.swapActivity();
    g.resetUpdatedFlags();
    expect(isUpdated(g.get(1, 1))).toBe(true); // preserved, chunk was inactive
    expect(isUpdated(g.get(40, 40))).toBe(false); // cleared, chunk was active
  });

  it('activeChunkCount() reports the number of active chunks', () => {
    const g = new Grid(48, 48, 16);
    g.set(0, 0, encode(1));
    g.set(47, 47, encode(2));
    g.swapActivity();
    const count = g.activeChunkCount();
    // Each set wakes a 3x3 neighbourhood (clipped at grid edges).
    // At the corners that's 2×2 = 4; two opposite corners = 8 distinct chunks.
    expect(count).toBeGreaterThanOrEqual(4);
    expect(count).toBeLessThanOrEqual(g.chunksX * g.chunksY);
  });

  it('isEmpty() reports EMPTY correctly', () => {
    const g = new Grid(8, 8, 4);
    expect(g.isEmpty(0, 0)).toBe(true);
    g.set(0, 0, encode(3));
    expect(g.isEmpty(0, 0)).toBe(false);
  });
});
