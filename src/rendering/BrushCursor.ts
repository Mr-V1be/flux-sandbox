import { Camera } from './Camera';
import { BrushShape } from '@/state/Store';

export interface BrushCursorState {
  visible: boolean;
  /** world (grid) coordinates */
  x: number;
  y: number;
  size: number;
  shape: BrushShape;
  /** Optional line start (while LMB down in line mode). */
  lineStart?: { x: number; y: number } | null;
}

/**
 * Draws the brush preview overlay on top of the rendered grid.
 * Purely visual — never touches the sim.
 */
export const drawBrushCursor = (
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  s: BrushCursorState,
  shakeX = 0,
  shakeY = 0,
): void => {
  if (!s.visible) return;
  const { sx, sy } = camera.worldToScreen(s.x + 0.5, s.y + 0.5);
  const r = (s.size / 2) * camera.zoom;

  ctx.save();
  ctx.translate(shakeX, shakeY);
  ctx.lineWidth = Math.max(1, camera.zoom * 0.25);
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 2;

  if (s.shape === 'circle' || s.shape === 'spray') {
    ctx.beginPath();
    ctx.arc(sx, sy, Math.max(2, r), 0, Math.PI * 2);
    ctx.stroke();
    if (s.shape === 'spray') {
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(2, r * 0.66), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  } else if (s.shape === 'square') {
    ctx.strokeRect(sx - r, sy - r, r * 2, r * 2);
  } else if (s.shape === 'replace') {
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.arc(sx, sy, Math.max(2, r), 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  } else if (s.shape === 'line') {
    ctx.beginPath();
    ctx.arc(sx, sy, Math.max(2, r), 0, Math.PI * 2);
    ctx.stroke();
    if (s.lineStart) {
      const { sx: ax, sy: ay } = camera.worldToScreen(
        s.lineStart.x + 0.5,
        s.lineStart.y + 0.5,
      );
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(sx, sy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(ax, ay, Math.max(2, r * 0.5), 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
};
