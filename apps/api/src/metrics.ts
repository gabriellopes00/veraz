const MAX_SAMPLES = 1000;

export type Stage = "transcribe" | "extract" | "verify" | "total";

interface Usage {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: { cached_tokens?: number };
  output_tokens_details?: { reasoning_tokens?: number };
}

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!);
}

export class Metrics {
  private samples: Record<Stage, number[]> = { transcribe: [], extract: [], verify: [], total: [] };
  private tokens: Record<string, { input: number; cached: number; output: number; reasoning: number; calls: number }> = {};
  claims = { detected: 0, verified: 0, errors: 0, cacheHits: 0, duplicates: 0 };

  observe(stage: Stage, ms: number) {
    const arr = this.samples[stage];
    arr.push(ms);
    if (arr.length > MAX_SAMPLES) arr.shift();
  }

  addUsage(kind: string, usage?: Usage | null) {
    const t = (this.tokens[kind] ??= { input: 0, cached: 0, output: 0, reasoning: 0, calls: 0 });
    t.calls++;
    if (!usage) return;
    t.input += usage.input_tokens ?? 0;
    t.cached += usage.input_tokens_details?.cached_tokens ?? 0;
    t.output += usage.output_tokens ?? 0;
    t.reasoning += usage.output_tokens_details?.reasoning_tokens ?? 0;
  }

  snapshot() {
    const latency: Record<string, { n: number; p50: number | null; p95: number | null }> = {};
    for (const [stage, arr] of Object.entries(this.samples)) {
      const sorted = [...arr].sort((a, b) => a - b);
      latency[stage] = { n: sorted.length, p50: percentile(sorted, 0.5), p95: percentile(sorted, 0.95) };
    }
    return { latencyMs: latency, tokens: this.tokens, claims: this.claims };
  }
}

export const metrics = new Metrics();
