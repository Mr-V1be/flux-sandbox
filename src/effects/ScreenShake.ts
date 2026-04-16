/**
 * Simple decay-based screen shake.
 * `kick()` adds a spike; `update()` decays amplitude exponentially;
 * `offsetX/Y` are random samples within the current amplitude.
 */
export class ScreenShake {
  private amplitude = 0;
  public offsetX = 0;
  public offsetY = 0;
  public decay = 0.88;
  public maxAmplitude = 14;

  kick(strength: number): void {
    // Square-root softens the felt intensity so big explosions
    // don't completely wreck the view.
    const a = Math.min(this.maxAmplitude, Math.sqrt(strength) * 3);
    if (a > this.amplitude) this.amplitude = a;
  }

  update(): void {
    if (this.amplitude < 0.2) {
      this.amplitude = 0;
      this.offsetX = 0;
      this.offsetY = 0;
      return;
    }
    this.offsetX = (Math.random() * 2 - 1) * this.amplitude;
    this.offsetY = (Math.random() * 2 - 1) * this.amplitude;
    this.amplitude *= this.decay;
  }
}
