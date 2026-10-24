import { monitorEventLoopDelay } from "node:perf_hooks";

const MAX_SAMPLES = 1000;

export type Stage = "transcribe" | "extract" | "verify" | "total";

export interface TokenUsage {
  input: number;
  cached: number;
  output: number;
  reasoning: number;
}

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!);
}

const LOOP_RESOLUTION_MS = 10;
/** The histogram includes its own sampling interval; report only the delay on top of it. */
const loopDelayMs = (ns: number) => Math.max(0, Math.round(ns / 1e4 - LOOP_RESOLUTION_MS * 100) / 100);

export class Metrics {
  private samples: Record<Stage, number[]> = { transcribe: [], extract: [], verify: [], total: [] };
  private tokens: Record<string, TokenUsage & { calls: number }> = {};
  private loop: ReturnType<typeof monitorEventLoopDelay> | null = null;
  claims = { detected: 0, verified: 0, errors: 0, cacheHits: 0, duplicates: 0 };

  observe(stage: Stage, ms: number) {
    const arr = this.samples[stage];
    arr.push(ms);
    if (arr.length > MAX_SAMPLES) arr.shift();
  }

  addTokens(kind: string, usage: Partial<TokenUsage>) {
    this.tokens[kind] ??= { input: 0, cached: 0, output: 0, reasoning: 0, calls: 0 };
    const t = this.tokens[kind];
    t.calls++;
    t.input += usage.input ?? 0;
    t.cached += usage.cached ?? 0;
    t.output += usage.output ?? 0;
    t.reasoning += usage.reasoning ?? 0;
  }

  /** Tracks event loop delay: anything CPU-bound on the main thread shows up here and slows every lane. */
  watchEventLoop() {
    this.loop ??= monitorEventLoopDelay({ resolution: LOOP_RESOLUTION_MS });
    this.loop.enable();
  }

  snapshot() {
    const latency: Record<string, { n: number; p50: number | null; p95: number | null }> = {};
    for (const [stage, arr] of Object.entries(this.samples)) {
      const sorted = [...arr].sort((a, b) => a - b);
      latency[stage] = { n: sorted.length, p50: percentile(sorted, 0.5), p95: percentile(sorted, 0.95) };
    }
    const eventLoopDelayMs = this.loop && {
      p50: loopDelayMs(this.loop.percentile(50)),
      p99: loopDelayMs(this.loop.percentile(99)),
      max: loopDelayMs(this.loop.max),
    };
    return { latencyMs: latency, eventLoopDelayMs, tokens: this.tokens, claims: this.claims };
  }
}
