import { describe, it, expect, beforeAll } from 'vitest';
import { serialize, deserialize } from '@/state/Serializer';
import { Grid } from '@/core/Grid';
import { TemperatureField } from '@/core/TemperatureField';
import { encode } from '@/core/types';
import { Readable } from 'node:stream';

beforeAll(async () => {
  // Node doesn't ship btoa/atob as globals before ~v16.
  if (typeof (globalThis as { btoa?: unknown }).btoa === 'undefined') {
    (globalThis as unknown as { btoa: (s: string) => string }).btoa = (s) =>
      Buffer.from(s, 'binary').toString('base64');
  }
  if (typeof (globalThis as { atob?: unknown }).atob === 'undefined') {
    (globalThis as unknown as { atob: (s: string) => string }).atob = (s) =>
      Buffer.from(s, 'base64').toString('binary');
  }
  // CompressionStream / DecompressionStream exist in Node 18+. Expose them globally.
  if (typeof (globalThis as { CompressionStream?: unknown }).CompressionStream === 'undefined') {
    const stream = await import('node:stream/web');
    (globalThis as unknown as { CompressionStream: typeof stream.CompressionStream }).CompressionStream =
      stream.CompressionStream;
    (globalThis as unknown as { DecompressionStream: typeof stream.DecompressionStream }).DecompressionStream =
      stream.DecompressionStream;
  }
  void Readable;
});

describe('Serializer', () => {
  it('round-trips grid cells and temperatures', async () => {
    const W = 32;
    const H = 16;
    const a = { grid: new Grid(W, H, 8), field: new TemperatureField(W, H) };
    // Seed with a checker pattern and some temperatures.
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if ((x + y) % 3 === 0) a.grid.set(x, y, encode((x + y) & 0xfff, (x * 7) & 0xff, (y * 11) & 0xff));
        a.field.set(x, y, ((x - y) * 3) & 0x7f);
      }
    }

    const encoded = await serialize(a.grid, a.field);
    expect(encoded.length).toBeGreaterThan(0);

    const b = { grid: new Grid(W, H, 8), field: new TemperatureField(W, H) };
    const res = await deserialize(encoded, b.grid, b.field);
    expect(res.ok).toBe(true);

    for (let i = 0; i < a.grid.cells.length; i++) {
      expect(b.grid.cells[i]).toBe(a.grid.cells[i]);
    }
    for (let i = 0; i < a.field.temps.length; i++) {
      expect(b.field.temps[i]).toBe(a.field.temps[i]);
    }
  });

  it('rejects payload with mismatched grid size', async () => {
    const a = { grid: new Grid(16, 16, 8), field: new TemperatureField(16, 16) };
    const encoded = await serialize(a.grid, a.field);
    const b = { grid: new Grid(32, 32, 8), field: new TemperatureField(32, 32) };
    const res = await deserialize(encoded, b.grid, b.field);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/size mismatch/);
  });

  it('rejects malformed payload', async () => {
    const g = new Grid(16, 16, 8);
    const f = new TemperatureField(16, 16);
    const res = await deserialize('not-a-real-payload', g, f);
    expect(res.ok).toBe(false);
  });
});
