import { Camera } from '@/rendering/Camera';

/**
 * Struct-of-arrays particle pool.
 *
 * Fixed-capacity pool uses Float32Arrays for position/velocity/life and
 * a swap-pop compaction to avoid reallocation. Particles live in world
 * (grid) coordinates and are projected via the camera on draw.
 *
 * Visual overlay only — particles do not affect the simulation.
 */
export interface SpawnOptions {
  count: number;
  color?: number;
  /** Spread velocity magnitude. */
  speed?: number;
  /** Life in ticks (~60 = 1s at 60fps). */
  life?: number;
  /** Size in grid cells. */
  size?: number;
  /** Gravity factor (per tick). */
  gravity?: number;
  /** Cone direction in radians (default: 360° burst). */
  angle?: number;
  angleSpread?: number;
}

export class ParticleSystem {
  private readonly max: number;
  private readonly x: Float32Array;
  private readonly y: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly size: Float32Array;
  private readonly color: Uint32Array;
  private readonly gravity: Float32Array;
  private count = 0;

  constructor(max = 1000) {
    this.max = max;
    this.x = new Float32Array(max);
    this.y = new Float32Array(max);
    this.vx = new Float32Array(max);
    this.vy = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size = new Float32Array(max);
    this.color = new Uint32Array(max);
    this.gravity = new Float32Array(max);
  }

  get active(): number {
    return this.count;
  }

  spawn(cx: number, cy: number, opts: SpawnOptions): void {
    const n = Math.min(opts.count, this.max - this.count);
    const speed = opts.speed ?? 0.6;
    const life = opts.life ?? 30;
    const size = opts.size ?? 1.5;
    const color = opts.color ?? 0xff9a22;
    const gravity = opts.gravity ?? 0.02;
    const baseAngle = opts.angle ?? 0;
    const angleSpread = opts.angleSpread ?? Math.PI * 2;

    for (let i = 0; i < n; i++) {
      const idx = this.count++;
      const ang = baseAngle + (Math.random() - 0.5) * angleSpread;
      const sp = speed * (0.4 + Math.random() * 0.6);
      this.x[idx] = cx;
      this.y[idx] = cy;
      this.vx[idx] = Math.cos(ang) * sp;
      this.vy[idx] = Math.sin(ang) * sp;
      const l = life * (0.7 + Math.random() * 0.6);
      this.life[idx] = l;
      this.maxLife[idx] = l;
      this.size[idx] = size * (0.6 + Math.random() * 0.8);
      this.color[idx] = color;
      this.gravity[idx] = gravity;
    }
  }

  update(): void {
    for (let i = 0; i < this.count; i++) {
      this.x[i] += this.vx[i];
      this.y[i] += this.vy[i];
      this.vy[i] += this.gravity[i];
      this.vx[i] *= 0.985;
      this.vy[i] *= 0.985;
      this.life[i] -= 1;
      if (this.life[i] <= 0) {
        const last = --this.count;
        if (i !== last) {
          this.x[i] = this.x[last];
          this.y[i] = this.y[last];
          this.vx[i] = this.vx[last];
          this.vy[i] = this.vy[last];
          this.life[i] = this.life[last];
          this.maxLife[i] = this.maxLife[last];
          this.size[i] = this.size[last];
          this.color[i] = this.color[last];
          this.gravity[i] = this.gravity[last];
        }
        i--;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, camera: Camera): void {
    if (this.count === 0) return;
    const zoom = camera.zoom;
    for (let i = 0; i < this.count; i++) {
      const a = this.life[i] / this.maxLife[i];
      const { sx, sy } = camera.worldToScreen(this.x[i], this.y[i]);
      const s = Math.max(1, this.size[i] * zoom);
      const c = this.color[i];
      const r = (c >> 16) & 0xff;
      const g = (c >> 8) & 0xff;
      const b = c & 0xff;
      ctx.fillStyle = `rgba(${r},${g},${b},${a.toFixed(3)})`;
      ctx.fillRect(sx - s / 2, sy - s / 2, s, s);
    }
  }

  clear(): void {
    this.count = 0;
  }
}
