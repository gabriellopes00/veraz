// Replays a sample PT-BR transcript through the pipeline and prints latency per stage.
// Mock:  MOCK_OPENAI=true bun run replay        Real: OPENAI_API_KEY=... bun run replay
import { createAI } from "../src/ai";
import { VerdictCache } from "../src/cache";
import { config } from "../src/config";
import { Limiter, Session } from "../src/session";
import { SAMPLE_PT } from "../src/sample";
import { metrics } from "../src/metrics";

const session = new Session(
  { mode: "chunked", sampleRate: 24000 },
  { ai: createAI(), cache: new VerdictCache(":memory:", config.cache.ttlMs), limiter: new Limiter(config.verify.concurrency) },
);

const t = new Map<string, { start: number; detected?: number; done?: number }>();
let current = 0;
session.subscribe((e) => {
  if (e.type !== "claim") return;
  const now = performance.now();
  const row = t.get(e.claim.id) ?? { start: current };
  t.set(e.claim.id, row);
  if (e.claim.status === "checking") row.detected = now;
  if (e.claim.status === "verified" || e.claim.status === "error") {
    row.done = now;
    console.log(
      `${(row.detected! - row.start).toFixed(0).padStart(6)} ms detect | ${(row.done - row.detected!).toFixed(0).padStart(6)} ms verdict | ${(e.claim.result?.verdict ?? "ERROR").padEnd(13)} | ${e.claim.claim.slice(0, 60)}${e.claim.cached ? " (cache)" : ""}`,
    );
  }
});

console.log(`mode: ${config.mock ? "mock" : "openai"}\n`);
const all: Promise<void>[] = [];
for (const line of SAMPLE_PT) {
  current = performance.now();
  all.push(session.ingest(line)); // utterances overlap like a live conversation
  await Bun.sleep(1500); // sentence pacing
}
await Promise.all(all);
console.log("\n/metrics snapshot:");
console.log(JSON.stringify(metrics.snapshot(), null, 2));
