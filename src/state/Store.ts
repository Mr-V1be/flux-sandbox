import { createStore } from 'zustand/vanilla';

export type BrushShape = 'circle' | 'square' | 'spray' | 'line' | 'replace';
export const BRUSH_SHAPES: BrushShape[] = ['circle', 'square', 'spray', 'line', 'replace'];

/** Temperature visualisation mode cycled by pressing T. */
export type HeatMode = 'off' | 'tint' | 'heatmap';
export const HEAT_MODES: HeatMode[] = ['off', 'tint', 'heatmap'];

/** Default ambient painting temperature (°). */
export const DEFAULT_PAINT_TEMP = 20;
export const PAINT_TEMP_MIN = -100;
export const PAINT_TEMP_MAX = 127;

export interface UiState {
  selectedKey: string;
  brushSize: number;
  brushShape: BrushShape;
  paintTemp: number;
  /**
   * World ambient air temperature. Drives `empty.emitTemp` at runtime;
   * updated only on manual slider drags, not on element auto-sync.
   */
  ambientTemp: number;
  paused: boolean;
  fps: number;
  activeCells: number;
  activeChunks: number;
  tick: number;
  heatMode: HeatMode;
  drawerOpen: boolean;
  zoom: number;
  setSelected(key: string): void;
  setBrush(size: number): void;
  setBrushShape(shape: BrushShape): void;
  cycleBrushShape(): void;
  setPaintTemp(temp: number): void;
  /**
   * Same as setPaintTemp, but flagged as a user-driven slider drag so
   * the simulation can sync the world's ambient air temperature to it.
   * Auto-sync on element select uses setPaintTemp, not this — the air
   * shouldn't change just because you clicked "Lava".
   */
  setPaintTempManual(temp: number): void;
  resetPaintTemp(): void;
  togglePause(): void;
  cycleHeatMode(): void;
  setHeatMode(mode: HeatMode): void;
  toggleDrawer(): void;
  setDrawerOpen(open: boolean): void;
  setStats(patch: Partial<Pick<UiState, 'fps' | 'activeCells' | 'activeChunks' | 'tick' | 'zoom'>>): void;
}

export const store = createStore<UiState>((set) => ({
  selectedKey: 'sand',
  brushSize: 6,
  brushShape: 'circle',
  paintTemp: DEFAULT_PAINT_TEMP,
  ambientTemp: 0,
  paused: false,
  fps: 0,
  activeCells: 0,
  activeChunks: 0,
  tick: 0,
  heatMode: 'off',
  drawerOpen: false,
  zoom: 1,
  setSelected: (key) => set({ selectedKey: key }),
  setBrush: (size) => set({ brushSize: Math.max(1, Math.min(64, size)) }),
  setBrushShape: (shape) => set({ brushShape: shape }),
  cycleBrushShape: () =>
    set((s) => ({
      brushShape: BRUSH_SHAPES[(BRUSH_SHAPES.indexOf(s.brushShape) + 1) % BRUSH_SHAPES.length],
    })),
  setPaintTemp: (temp) =>
    set({
      paintTemp: Math.max(
        PAINT_TEMP_MIN,
        Math.min(PAINT_TEMP_MAX, Math.round(temp)),
      ),
    }),
  setPaintTempManual: (temp) => {
    const clamped = Math.max(
      PAINT_TEMP_MIN,
      Math.min(PAINT_TEMP_MAX, Math.round(temp)),
    );
    set({ paintTemp: clamped, ambientTemp: clamped });
  },
  resetPaintTemp: () => set({ paintTemp: DEFAULT_PAINT_TEMP, ambientTemp: 0 }),
  togglePause: () => set((s) => ({ paused: !s.paused })),
  cycleHeatMode: () =>
    set((s) => ({
      heatMode: HEAT_MODES[(HEAT_MODES.indexOf(s.heatMode) + 1) % HEAT_MODES.length],
    })),
  setHeatMode: (mode) => set({ heatMode: mode }),
  toggleDrawer: () => set((s) => ({ drawerOpen: !s.drawerOpen })),
  setDrawerOpen: (open) => set({ drawerOpen: open }),
  setStats: (patch) => set(patch),
}));

export const getState = store.getState;
export const subscribe = store.subscribe;
