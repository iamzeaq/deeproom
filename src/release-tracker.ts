/**
 * Tracks hand speed while the orb is held so a release can be classified as
 * a flick. The peak (lightly smoothed) speed is held for `windowSeconds`, so a
 * throw followed by opening the hand a moment later still counts.
 * Dependency-free so it can be unit-tested outside the browser.
 */
export class ReleaseTracker {
  private x = 0;
  private y = 0;
  private z = 0;
  private smoothed = 0;
  private peak = 0;
  private peakAge = 0;

  private readonly windowSeconds: number;
  private readonly smoothingSeconds: number;

  constructor(windowSeconds = 0.25, smoothingSeconds = 0.03) {
    this.windowSeconds = windowSeconds;
    this.smoothingSeconds = smoothingSeconds;
  }

  reset(x: number, y: number, z: number): void {
    this.x = x;
    this.y = y;
    this.z = z;
    this.smoothed = 0;
    this.peak = 0;
    this.peakAge = 0;
  }

  sample(x: number, y: number, z: number, delta: number): void {
    if (delta <= 0) return;
    const dx = x - this.x;
    const dy = y - this.y;
    const dz = z - this.z;
    this.x = x;
    this.y = y;
    this.z = z;
    const speed = Math.sqrt(dx * dx + dy * dy + dz * dz) / delta;
    this.smoothed += (speed - this.smoothed) * Math.min(1, delta / this.smoothingSeconds);
    this.peakAge += delta;
    if (this.smoothed >= this.peak || this.peakAge > this.windowSeconds) {
      this.peak = this.smoothed;
      this.peakAge = 0;
    }
  }

  /** Highest recent speed in m/s. */
  get peakSpeed(): number {
    return this.peak;
  }

  isFlick(threshold: number): boolean {
    return this.peak >= threshold;
  }
}
