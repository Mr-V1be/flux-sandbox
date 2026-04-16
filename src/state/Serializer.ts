import { Grid } from '@/core/Grid';
import { TemperatureField } from '@/core/TemperatureField';

/**
 * Binary serialization for shareable URLs and local autosaves.
 *
 * Layout (little-endian except magic):
 *   bytes  0..3   magic "FLX1"                      (big-endian marker)
 *   bytes  4..7   grid width  (Uint32)
 *   bytes  8..11  grid height (Uint32)
 *   bytes 12..15  version     (Uint32, currently 1)
 *   bytes 16..    w*h * 4     grid cells (Uint32Array)
 *   bytes ...     w*h         temperature (Int8Array)
 *
 * The whole buffer is gzipped through the browser's native
 * `CompressionStream('gzip')` and then base64url-encoded so it fits
 * cleanly in `location.hash`.
 */

const MAGIC = 0x464c5831; // 'F','L','X','1'
const VERSION = 1;
const HEADER_BYTES = 16;

export async function serialize(grid: Grid, field: TemperatureField): Promise<string> {
  const w = grid.width;
  const h = grid.height;
  const size = w * h;
  const buf = new ArrayBuffer(HEADER_BYTES + size * 4 + size);
  const view = new DataView(buf);

  view.setUint32(0, MAGIC, false); // big-endian magic
  view.setUint32(4, w, true);
  view.setUint32(8, h, true);
  view.setUint32(12, VERSION, true);

  new Uint32Array(buf, HEADER_BYTES, size).set(grid.cells);
  new Int8Array(buf, HEADER_BYTES + size * 4, size).set(field.temps);

  const compressed = await gzip(new Uint8Array(buf));
  return u8ToBase64Url(compressed);
}

export interface DeserializeResult {
  ok: boolean;
  reason?: string;
}

export async function deserialize(
  encoded: string,
  grid: Grid,
  field: TemperatureField,
): Promise<DeserializeResult> {
  try {
    const compressed = base64UrlToU8(encoded);
    const buf = await gunzip(compressed);
    const view = new DataView(buf);

    if (view.getUint32(0, false) !== MAGIC) {
      return { ok: false, reason: 'not a Flux Sandbox payload' };
    }
    const w = view.getUint32(4, true);
    const h = view.getUint32(8, true);
    const version = view.getUint32(12, true);

    if (version !== VERSION) {
      return { ok: false, reason: `unsupported payload version ${version}` };
    }
    if (w !== grid.width || h !== grid.height) {
      return {
        ok: false,
        reason: `grid size mismatch (payload ${w}×${h}, runtime ${grid.width}×${grid.height})`,
      };
    }

    const size = w * h;
    const cellsView = new Uint32Array(buf, HEADER_BYTES, size);
    grid.cells.set(cellsView);
    const tempsView = new Int8Array(buf, HEADER_BYTES + size * 4, size);
    field.temps.set(tempsView);
    grid.wakeAll();
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

// ─── internals ─────────────────────────────────────────────────────────

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes: Uint8Array): Promise<ArrayBuffer> {
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

function u8ToBase64Url(bytes: Uint8Array): string {
  // Chunk the conversion to avoid stack overflow on long buffers.
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlToU8(b64url: string): Uint8Array {
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
