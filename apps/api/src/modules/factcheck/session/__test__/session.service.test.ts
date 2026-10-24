import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ServerEvent } from "@veraz/shared";
import { config } from "../../../../config.ts";
import { Metrics } from "../../../../shared/metrics.ts";
import { MockTranscription } from "../../../transcription/index.ts";
import { MockClaimEmbedder, MockClaimExtractor } from "../../claim/claim.mock.adapter.ts";
import { createFactcheckModule, type FactcheckDeps, type FactcheckFacade } from "../../factcheck.module.ts";
import { SqliteVerdictCache } from "../../verification/verdict-cache.repository.ts";
import { MockVerifier } from "../../verification/verification.mock.adapter.ts";

const setup = (overrides: Partial<FactcheckDeps> = {}) =>
  createFactcheckModule({
    transcription: new MockTranscription(),
    extractor: new MockClaimExtractor(),
    embedder: new MockClaimEmbedder(),
    verifier: new MockVerifier(),
    cache: new SqliteVerdictCache(":memory:", 60_000),
    metrics: new Metrics(),
    config,
    ...overrides,
  }).facade;

const chunked = (sessions: FactcheckFacade) => sessions.start({ mode: "chunked", sampleRate: 24000 });
const claims = (sessions: FactcheckFacade, id: string) => sessions.state(id).claims;

function record(sessions: FactcheckFacade, id: string) {
  const events: ServerEvent[] = [];
  sessions.subscribe(id, (e) => events.push(e));
  return events;
}

describe("pipeline (mock adapters)", () => {
  test("claim goes checking -> verified with sources; opinions are skipped", async () => {
    const sessions = setup();
    const id = chunked(sessions);
    const events = record(sessions, id);
    await sessions.ingestText(id, "Eu acho que esse filme é chato.");
    assert.equal(claims(sessions, id).length, 0);
    await sessions.ingestText(id, "O Brasil tem mais de 200 milhões de habitantes.");

    const statuses = events.flatMap((e) => (e.type === "claim" ? [e.claim.status] : []));
    assert.deepEqual(statuses, ["checking", "verified"]);
    const [claim] = claims(sessions, id);
    assert.ok(claim!.result!.sources.length >= 3);
    assert.equal(claim!.language, "pt");
  });

  test("duplicates in the same session are removed", async () => {
    const sessions = setup();
    const id = chunked(sessions);
    const events = record(sessions, id);
    await sessions.ingestText(id, "A inflação em 2023 foi de 4,62 por cento.");
    await sessions.ingestText(id, "A inflação em 2023 foi de 4,62 por cento.");
    assert.equal(claims(sessions, id).length, 1);
    assert.ok(events.some((e) => e.type === "claim.removed"));
  });

  test("the cross-session cache resolves instantly", async () => {
    const sessions = setup();
    await sessions.ingestText(chunked(sessions), "O Brasil ganhou cinco Copas do Mundo.");
    const id = chunked(sessions);
    await sessions.ingestText(id, "O Brasil ganhou cinco Copas do Mundo.");
    const [c] = claims(sessions, id);
    assert.equal(c!.status, "verified");
    assert.equal(c!.cached, true);
  });

  test("a claim that contradicts an earlier one is flagged CONTRADICTORY", async () => {
    const sessions = setup();
    const id = chunked(sessions);
    await sessions.ingestText(id, "O Brasil tem mais de 200 milhões de habitantes.");
    await sessions.ingestText(id, "O Brasil tem menos de 100 milhões de habitantes.");
    const verdicts = claims(sessions, id).map((c) => c.result?.verdict);
    assert.ok(verdicts.includes("CONTRADICTORY"));
  });

  test("verification errors surface as status=error", async () => {
    const sessions = setup({
      verifier: {
        verify: async () => {
          throw new Error("boom");
        },
      },
    });
    const id = chunked(sessions);
    await sessions.ingestText(id, "A Amazônia perdeu 10 mil km² de floresta.");
    const [c] = claims(sessions, id);
    assert.equal(c!.status, "error");
    assert.equal(c!.error, "boom");
  });

  test("ending a session aborts verifications in flight", async () => {
    let aborted = false;
    const sessions = setup({
      verifier: {
        verify: (_c, _p, signal) =>
          new Promise((_, reject) =>
            signal.addEventListener("abort", () => {
              aborted = true;
              reject(signal.reason);
            }),
          ),
      },
    });
    const id = chunked(sessions);
    const done = sessions.ingestText(id, "O Brasil ganhou cinco Copas do Mundo.");
    await new Promise((r) => setTimeout(r, 100));
    sessions.end(id);
    await done;
    assert.ok(aborted);
    assert.throws(() => sessions.state(id), { name: "SessionNotFoundError" });
  });
});
