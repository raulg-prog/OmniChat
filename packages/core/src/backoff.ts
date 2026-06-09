/**
 * Exponential backoff delay calculator shared by every reconnecting adapter.
 * Holds no timers — the caller owns scheduling; this only computes the next delay.
 * Call reset() after a successful (re)connection so the next drop starts at the floor.
 */
export class Backoff {
  private current: number;

  constructor(
    private readonly min = 1000,
    private readonly max = 30000,
    private readonly factor = 2,
  ) {
    this.current = min;
  }

  /** Return to the floor delay (call once a connection is confirmed healthy). */
  reset(): void {
    this.current = this.min;
  }

  /** Delay (ms) to wait before the next attempt, then grow it for the attempt after. */
  next(): number {
    const delay = this.current;
    this.current = Math.min(this.current * this.factor, this.max);
    return delay;
  }
}
