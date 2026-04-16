import { createStore } from 'zustand/vanilla';

export type BrushShape = 'circle' | 'square' | 'spray' | 'line' | 'replace';
export const BRUSH_SHAPES: BrushShape[] = ['circle', 'square', 'spray', 'line', 'replace'];

/** Temperature visualisation mode cycled by pressing T. */
export type HeatMode = 'off' | 'tint' | 'heatmap';
export const HEAT_MODES: HeatMode[] = ['off', 'tint', 'heatmap'];

/** Default ambient air temperature (°) — 0 reads neutral on the heat-map. */
export const DEFAULT_AMBIENT_TEMP = 0;
export const AMBIENT_TEMP_MIN = -100;
export const AMBIENT_TEMP_MAX = 127;

export interface UiState {
  selectedKey: string;
  brushSize: number;
  brushShape: BrushShape;
  /**
   * World ambient air temperature — the *only* thing the temperature
   * slider controls. Every empty cell is snapped to this, and painted
   * materials without a natural spawn temperature (sand, stone, …)
   * inherit it. Materials with a natural spawnTemp (lava 110°, ice
   * −20°, …) ignore this and keep their intrinsic temperature.
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
  setAmbientTemp(temp: number): void;
  resetAmbientTemp(): void;
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
  ambientTemp: DEFAULT_AMBIENT_TEMP,
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
  setAmbientTemp: (temp) =>
    set({
      ambientTemp: Math.max(
        AMBIENT_TEMP_MIN,
        Math.min(AMBIENT_TEMP_MAX, Math.round(temp)),
      ),
    }),
  resetAmbientTemp: () => set({ ambientTemp: DEFAULT_AMBIENT_TEMP }),
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
