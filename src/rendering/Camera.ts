/**
 * 2D camera for the sim canvas.
 *
 * - `zoom` is measured in device-pixels per grid cell
 * - `offsetX/Y` is the device-pixel position of the grid's (0,0) corner
 *   on the canvas
 *
 * All coordinate conversions work in device-pixel space. The caller is
 * responsible for converting CSS pixels <-> device pixels (multiply by dpr)
 * before calling screenToWorld.
 */
export class Camera {
  public offsetX = 0;
  public offsetY = 0;
  public zoom = 1;
  public minZoom = 0.5;
  public maxZoom = 32;

  constructor(
    private readonly gridWidth: number,
    private readonly gridHeight: number,
  ) {}

  /** Fit the grid inside the given canvas pixel size, centered. */
  fit(canvasW: number, canvasH: number, padding = 24): void {
    const pad = padding * (window.devicePixelRatio || 1);
    const availW = Math.max(1, canvasW - pad * 2);
    const availH = Math.max(1, canvasH - pad * 2);
    const z = Math.min(availW / this.gridWidth, availH / this.gridHeight);
    this.zoom = clamp(z, this.minZoom, this.maxZoom);
    this.center(canvasW, canvasH);
  }

  center(canvasW: number, canvasH: number): void {
    this.offsetX = Math.round((canvasW - this.gridWidth * this.zoom) / 2);
    this.offsetY = Math.round((canvasH - this.gridHeight * this.zoom) / 2);
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - this.offsetX) / this.zoom,
      y: (sy - this.offsetY) / this.zoom,
    };
  }

  worldToScreen(wx: number, wy: number): { sx: number; sy: number } {
    return {
      sx: wx * this.zoom + this.offsetX,
      sy: wy * this.zoom + this.offsetY,
    };
  }

  /** Zoom around a fixed screen anchor (typically the cursor). */
  zoomAt(sx: number, sy: number, factor: number): void {
    const before = this.screenToWorld(sx, sy);
    this.zoom = clamp(this.zoom * factor, this.minZoom, this.maxZoom);
    const after = this.worldToScreen(before.x, before.y);
    this.offsetX += sx - after.sx;
    this.offsetY += sy - after.sy;
  }

  pan(dx: number, dy: number): void {
    this.offsetX += dx;
    this.offsetY += dy;
  }

  /** Clamp the camera so the grid stays at least partially on screen. */
  clampToView(canvasW: number, canvasH: number, margin = 64): void {
    const m = margin * (window.devicePixelRatio || 1);
    const w = this.gridWidth * this.zoom;
    const h = this.gridHeight * this.zoom;
    this.offsetX = clamp(this.offsetX, -w + m, canvasW - m);
    this.offsetY = clamp(this.offsetY, -h + m, canvasH - m);
  }
}

const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;
