import { createStore } from 'zustand/vanilla';

export type BrushShape = 'circle' | 'square' | 'spray' | 'line' | 'replace';
export const BRUSH_SHAPES: BrushShape[] = ['circle', 'square', 'spray', 'line', 'replace'];

/** Temperature visualisation mode cycled by pressing T. */
export type HeatMode = 'off' | 'tint' | 'heatmap';
export const HEAT_MODES: HeatMode[] = ['off', 'tint', 'heatmap'];

export interface UiState {
  selectedKey: string;
  brushSize: number;
  brushShape: BrushShape;
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
