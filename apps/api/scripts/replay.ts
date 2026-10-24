// Replays a sample PT-BR transcript through the pipeline and prints latency per stage.
// Mock:  MOCK_OPENAI=true pnpm replay        Real: pnpm replay (OPENAI_API_KEY in apps/api/.env)
import { setTimeout as sleep } from "node:timers/promises";
import { config } from "../src/config.ts";
import { createContainer } from "../src/container.ts";
import { SAMPLE_PT } from "../src/modules/transcription/index.ts";

const { factcheck, metrics } = createContainer({ ...config, dbPath: ":memory:" });
const sessions = factcheck.facade;
const id = sessions.start({ mode: "chunked", sampleRate: 24000 });

const t = new Map<string, { start: number; detected?: number; done?: number }>();
let current = 0;
sessions.subscribe(id, (e) => {
  if (e.type !== "claim") return;
  const now = performance.now();
  const row = t.get(e.claim.id) ?? { start: current };
  t.set(e.claim.id, row);
  if (e.claim.status === "checking") row.detected = now;
  if (e.claim.status === "verified" || e.claim.status === "error") {
    row.done = now;
    const detect = (row.detected! - row.start).toFixed(0).padStart(6);
    const verdict = (row.done - row.detected!).toFixed(0).padStart(6);
    const label = (e.claim.result?.verdict ?? "ERROR").padEnd(13);
    console.log(
      `${detect} ms detect | ${verdict} ms verdict | ${label} | ${e.claim.claim.slice(0, 60)}${e.claim.cached ? " (cache)" : ""}`,
    );
  }
});

console.log(`mode: ${config.mock ? "mock" : "openai"}\n`);
const all: Promise<void>[] = [];
for (const line of SAMPLE_PT) {
  current = performance.now();
  all.push(sessions.ingestText(id, line)); // utterances overlap like a live conversation
  await sleep(1500); // sentence pacing
}
await Promise.all(all);
console.log("\n/metrics snapshot:");
console.log(JSON.stringify(metrics.snapshot(), null, 2));
