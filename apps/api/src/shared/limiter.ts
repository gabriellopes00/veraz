/** Counting semaphore: caps parallel work (verifications run in-process, no queue). */
export class Limiter {
  private active = 0;
  private readonly waiting: (() => void)[] = [];
  private readonly max: number;

  constructor(max: number) {
    this.max = max;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active < this.max) this.active++;
    else await new Promise<void>((r) => this.waiting.push(r)); // the finishing task hands its slot over
    try {
      return await fn();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.active--;
    }
  }
}
