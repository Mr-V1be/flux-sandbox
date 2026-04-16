import { Grid } from '@/core/Grid';
import { encode, getElement } from '@/core/types';
import {
  getDefinitionByKey,
  getIdByKey,
  listElements,
  registryArray,
} from '@/elements/registry';
import { store, BrushShape } from '@/state/Store';
import { Camera } from '@/rendering/Camera';
import { BrushCursorState } from '@/rendering/BrushCursor';

/**
 * Handles pointer + keyboard input:
 *   - shape-aware paint (circle, square, spray, line, replace)
 *   - middle / Alt+left drag for pan
 *   - Ctrl+wheel (or +/- keys) for zoom; Ctrl+click = pipette
 *   - wheel (no modifier) for brush size
 *   - element hotkeys, clear, pause, fit, Tab to cycle brush shape
 *
 * Also exposes a BrushCursorState used by the overlay renderer.
 */
export class InputController {
  public readonly cursor: BrushCursorState = {
    visible: false,
    x: 0,
    y: 0,
    size: 6,
    shape: 'circle',
    lineStart: null,
  };

  private painting = false;
  private erasing = false;
  private panning = false;
  private lineMode = false;
  private lastX: number | null = null;
  private lastY: number | null = null;
  private lastClient: { x: number; y: number } | null = null;

  /** Active pointers for multi-touch gestures (pinch + 2-finger pan). */
  private pointers = new Map<number, { x: number; y: number }>();
  private prevPinchDist: number | null = null;
  private prevPinchCenter: { x: number; y: number } | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly grid: Grid,
    private readonly camera: Camera,
    private readonly onCameraChanged: () => void = () => {},
  ) {
    this.bind();
    store.subscribe((s, prev) => {
      this.cursor.size = s.brushSize;
      this.cursor.shape = s.brushShape;
      if (s.brushShape !== 'line' && prev.brushShape === 'line') {
        this.cursor.lineStart = null;
      }
    });
  }

  private bind(): void {
    const c = this.canvas;
    c.addEventListener('pointerdown', this.onDown);
    c.addEventListener('pointermove', this.onMove);
    c.addEventListener('pointerenter', () => (this.cursor.visible = true));
    c.addEventListener('pointerleave', () => (this.cursor.visible = false));
    window.addEventListener('pointerup', this.onUp);
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', this.onKeyDown);
    c.addEventListener('wheel', this.onWheel, { passive: false });
  }

  private clientToCanvasPx(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    return { x: (clientX - rect.left) * dpr, y: (clientY - rect.top) * dpr };
  }

  private clientToGrid(clientX: number, clientY: number): { x: number; y: number } {
    const { x, y } = this.clientToCanvasPx(clientX, clientY);
    const world = this.camera.screenToWorld(x, y);
    return { x: Math.floor(world.x), y: Math.floor(world.y) };
  }

  private onDown = (e: PointerEvent): void => {
    this.canvas.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Multi-touch: 2 active pointers → pinch-zoom + pan. Cancels paint.
    if (this.pointers.size === 2) {
      this.painting = false;
      this.lineMode = false;
      this.cursor.lineStart = null;
      const [a, b] = Array.from(this.pointers.values());
      this.prevPinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      this.prevPinchCenter = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      return;
    }

    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      this.panning = true;
      this.lastClient = { x: e.clientX, y: e.clientY };
      return;
    }

    const { x, y } = this.clientToGrid(e.clientX, e.clientY);

    // Pipette: Ctrl/Cmd + click samples element at cursor.
    if (e.button === 0 && (e.ctrlKey || e.metaKey)) {
      this.pickElement(x, y);
      return;
    }

    this.erasing = e.button === 2 || e.shiftKey;
    const state = store.getState();

    if (state.brushShape === 'line' && !this.erasing) {
      this.lineMode = true;
      this.cursor.lineStart = { x, y };
      return;
    }

    this.painting = true;
    this.paintShape(x, y, state.brushShape, this.erasing);
    this.lastX = x;
    this.lastY = y;
  };

  private onMove = (e: PointerEvent): void => {
    if (this.pointers.has(e.pointerId)) {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    // Pinch + pan while exactly two pointers are down.
    if (this.pointers.size === 2 && this.prevPinchDist !== null) {
      const pts = Array.from(this.pointers.values());
      const a = pts[0]!;
      const b = pts[1]!;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (dist > 0) {
        const factor = dist / this.prevPinchDist;
        const { x: sx, y: sy } = this.clientToCanvasPx(center.x, center.y);
        this.camera.zoomAt(sx, sy, factor);
      }
      if (this.prevPinchCenter) {
        const dpr = window.devicePixelRatio || 1;
        this.camera.pan(
          (center.x - this.prevPinchCenter.x) * dpr,
          (center.y - this.prevPinchCenter.y) * dpr,
        );
      }
      this.prevPinchDist = dist;
      this.prevPinchCenter = center;
      this.onCameraChanged();
      return;
    }

    const { x, y } = this.clientToGrid(e.clientX, e.clientY);
    this.cursor.x = x;
    this.cursor.y = y;

    if (this.panning) {
      if (this.lastClient) {
        const dpr = window.devicePixelRatio || 1;
        const dx = (e.clientX - this.lastClient.x) * dpr;
        const dy = (e.clientY - this.lastClient.y) * dpr;
        this.camera.pan(dx, dy);
        this.onCameraChanged();
        this.lastClient = { x: e.clientX, y: e.clientY };
      }
      return;
    }
    if (this.lineMode) return; // preview only
    if (!this.painting) return;
    const state = store.getState();
    // For shaped brushes that aren't drag-friendly, stroke between last and current.
    if (state.brushShape === 'line') return;
    this.strokeBetween(this.lastX, this.lastY, x, y, state.brushShape, this.erasing);
    this.lastX = x;
    this.lastY = y;
  };

  private onUp = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
    // Exit pinch mode as soon as we drop below 2 pointers.
    if (this.pointers.size < 2) {
      this.prevPinchDist = null;
      this.prevPinchCenter = null;
    }
    if (this.lineMode) {
      const { x, y } = this.clientToGrid(e.clientX, e.clientY);
      const start = this.cursor.lineStart;
      if (start) this.drawLine(start.x, start.y, x, y, this.erasing);
      this.cursor.lineStart = null;
      this.lineMode = false;
    }
    this.painting = false;
    this.panning = false;
    this.lastX = null;
    this.lastY = null;
    this.lastClient = null;
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.target instanceof HTMLInputElement) return;
    const key = e.key.toLowerCase();
    if (key === ' ') {
      e.preventDefault();
      store.getState().togglePause();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      store.getState().cycleBrushShape();
      return;
    }
    if (key === 'c') {
      this.grid.clear();
      return;
    }
    if (key === 'f') {
      this.camera.fit(this.canvas.width, this.canvas.height);
      this.onCameraChanged();
      return;
    }
    if (key === '1') {
      this.camera.zoom = 4 * (window.devicePixelRatio || 1);
      this.camera.center(this.canvas.width, this.canvas.height);
      this.onCameraChanged();
      return;
    }
    if (key === '[') {
      const s = store.getState();
      s.setBrush(s.brushSize - 1);
      return;
    }
    if (key === ']') {
      const s = store.getState();
      s.setBrush(s.brushSize + 1);
      return;
    }
    if (key === '=' || key === '+') {
      const rect = this.canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      this.camera.zoomAt((rect.width / 2) * dpr, (rect.height / 2) * dpr, 1.2);
      this.onCameraChanged();
      return;
    }
    if (key === '-' || key === '_') {
      const rect = this.canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      this.camera.zoomAt((rect.width / 2) * dpr, (rect.height / 2) * dpr, 1 / 1.2);
      this.onCameraChanged();
      return;
    }
    if (key === 't') {
      store.getState().toggleTemperature();
      return;
    }
    const match = listElements().find((d) => d.hotkey && d.hotkey.toLowerCase() === key);
    if (match) store.getState().setSelected(match.key);
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const { x, y } = this.clientToCanvasPx(e.clientX, e.clientY);
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      this.camera.zoomAt(x, y, factor);
      this.onCameraChanged();
      return;
    }
    const delta = Math.sign(e.deltaY);
    const s = store.getState();
    s.setBrush(s.brushSize - delta);
  };

  // ─── painting primitives ──────────────────────────────────────────────

  private pickElement(x: number, y: number): void {
    if (!this.grid.inBounds(x, y)) return;
    const id = getElement(this.grid.get(x, y));
    const def = registryArray()[id];
    if (def && def.key !== 'empty') store.getState().setSelected(def.key);
  }

  private strokeBetween(
    lx: number | null,
    ly: number | null,
    x: number,
    y: number,
    shape: BrushShape,
    erasing: boolean,
  ): void {
    if (lx === null || ly === null) {
      this.paintShape(x, y, shape, erasing);
      return;
    }
    // Bresenham between samples to close gaps from fast pointer moves.
    const dx = Math.abs(x - lx);
    const dy = Math.abs(y - ly);
    const sx = lx < x ? 1 : -1;
    const sy = ly < y ? 1 : -1;
    let err = dx - dy;
    let cx = lx;
    let cy = ly;
    while (true) {
      this.paintShape(cx, cy, shape, erasing);
      if (cx === x && cy === y) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        cx += sx;
      }
      if (e2 < dx) {
        err += dx;
        cy += sy;
      }
    }
  }

  private drawLine(ax: number, ay: number, bx: number, by: number, erasing: boolean): void {
    const dx = Math.abs(bx - ax);
    const dy = Math.abs(by - ay);
    const sx = ax < bx ? 1 : -1;
    const sy = ay < by ? 1 : -1;
    let err = dx - dy;
    let x = ax;
    let y = ay;
    while (true) {
      this.paintShape(x, y, 'circle', erasing);
      if (x === bx && y === by) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }
  }

  private paintShape(
    cx: number,
    cy: number,
    shape: BrushShape,
    erasing: boolean,
  ): void {
    const state = store.getState();
    const keyToUse = erasing ? 'empty' : state.selectedKey;
    const def = getDefinitionByKey(keyToUse);
    if (!def) return;
    const id = getIdByKey(keyToUse);
    const radius = Math.max(0, Math.floor(state.brushSize / 2));
    const r2 = radius * radius;

    const sparsePick = (): boolean => {
      if (erasing) return true;
      if (def.category === 'gas' && Math.random() > 0.3) return false;
      if (def.category === 'liquid' && Math.random() > 0.7) return false;
      if (def.category === 'powder' && Math.random() > 0.85) return false;
      if (def.category === 'special' && Math.random() > 0.2) return false;
      return true;
    };

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        let ok = false;
        if (shape === 'circle' || shape === 'replace' || shape === 'line') {
          ok = dx * dx + dy * dy <= r2;
        } else if (shape === 'square') {
          ok = true;
        } else if (shape === 'spray') {
          ok = dx * dx + dy * dy <= r2 && Math.random() < 0.35;
        }
        if (!ok) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (!this.grid.inBounds(x, y)) continue;

        if (shape === 'replace' && !erasing) {
          // Only paint where a non-empty cell exists (and not the same element).
          const existing = getElement(this.grid.get(x, y));
          if (existing === 0 || existing === id) continue;
        }

        if (shape !== 'replace' && !sparsePick()) continue;

        const variant = (Math.random() * 255) | 0;
        this.grid.set(x, y, encode(id, def.key === 'fire' ? 60 : 0, variant));
      }
    }
  }
}
