import { Grid } from '@/core/Grid';
import { TemperatureField } from '@/core/TemperatureField';
import { serialize, deserialize } from './Serializer';

/**
 * Six local save slots backed by `localStorage`. Reuses the same binary
 * format the Share URL uses so snapshots and links are interchangeable.
 *
 * LocalStorage caps around 5 MB; a compressed scene is typically 20–60 KB
 * so six slots is well within budget.
 */

const SLOT_COUNT = 6;
const SLOT_KEY = (idx: number) => `flux.snapshot.${idx}`;
const META_KEY = 'flux.snapshots.meta';

export interface SlotMeta {
  idx: number;
  hasData: boolean;
  savedAt?: number;
  sizeBytes?: number;
}

interface PersistedMeta {
  [idx: number]: { savedAt: number; sizeBytes: number };
}

const loadMeta = (): PersistedMeta => {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as PersistedMeta;
  } catch {
    return {};
  }
};

const writeMeta = (meta: PersistedMeta): void => {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    // storage full / private mode — fail silently.
  }
};

export const listSlots = (): SlotMeta[] => {
  const meta = loadMeta();
  const out: SlotMeta[] = [];
  for (let i = 0; i < SLOT_COUNT; i++) {
    const entry = meta[i];
    out.push({
      idx: i,
      hasData: !!entry && localStorage.getItem(SLOT_KEY(i)) !== null,
      savedAt: entry?.savedAt,
      sizeBytes: entry?.sizeBytes,
    });
  }
  return out;
};

export const saveSnapshot = async (
  idx: number,
  grid: Grid,
  field: TemperatureField,
): Promise<void> => {
  if (idx < 0 || idx >= SLOT_COUNT) throw new Error(`slot out of range: ${idx}`);
  const encoded = await serialize(grid, field);
  try {
    localStorage.setItem(SLOT_KEY(idx), encoded);
  } catch (err) {
    throw new Error(`failed to save slot ${idx}: ${(err as Error).message}`);
  }
  const meta = loadMeta();
  meta[idx] = { savedAt: Date.now(), sizeBytes: encoded.length };
  writeMeta(meta);
};

export const loadSnapshot = async (
  idx: number,
  grid: Grid,
  field: TemperatureField,
): Promise<{ ok: boolean; reason?: string }> => {
  if (idx < 0 || idx >= SLOT_COUNT) return { ok: false, reason: 'slot out of range' };
  const encoded = localStorage.getItem(SLOT_KEY(idx));
  if (!encoded) return { ok: false, reason: 'empty slot' };
  return deserialize(encoded, grid, field);
};

export const clearSnapshot = (idx: number): void => {
  localStorage.removeItem(SLOT_KEY(idx));
  const meta = loadMeta();
  delete meta[idx];
  writeMeta(meta);
};

export const slotLabel = (meta: SlotMeta): string => {
  if (!meta.hasData) return `Slot ${meta.idx + 1} — empty`;
  const ago = meta.savedAt ? timeAgo(meta.savedAt) : 'unknown';
  const size = meta.sizeBytes ? ` · ${Math.round(meta.sizeBytes / 1024)} KB` : '';
  return `Slot ${meta.idx + 1} — ${ago}${size}`;
};

const timeAgo = (ts: number): string => {
  const seconds = Math.round((Date.now() - ts) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
};
