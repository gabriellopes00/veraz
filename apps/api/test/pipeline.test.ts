import { describe, expect, test } from "bun:test";
import type { ServerEvent } from "@veraz/shared";
import { VerdictCache } from "../src/cache";
import { createMockAI } from "../src/mock";
import { Limiter, Session } from "../src/session";

const deps = (cache = new VerdictCache(":memory:", 60_000)) => ({ ai: createMockAI(), cache, limiter: new Limiter(4) });
const newSession = (d = deps()) => new Session({ mode: "chunked", sampleRate: 24000 }, d);

function record(s: Session) {
  const events: ServerEvent[] = [];
  s.subscribe((e) => events.push(e));
  return events;
}

describe("pipeline (mock mode)", () => {
  test("claim goes checking -> verified with sources; opinions are skipped", async () => {
    const s = newSession();
    const events = record(s);
    await s.ingest("Eu acho que esse filme é chato.");
    expect(s.claims.size).toBe(0);
    await s.ingest("O Brasil tem mais de 200 milhões de habitantes.");

    const statuses = events.filter((e) => e.type === "claim").map((e) => (e as any).claim.status);
    expect(statuses).toEqual(["checking", "verified"]);
    const claim = [...s.claims.values()][0]!;
    expect(claim.result?.sources.length).toBeGreaterThanOrEqual(3);
    expect(claim.language).toBe("pt");
  });

  test("duplicates in the same session are removed", async () => {
    const s = newSession();
    const events = record(s);
    await s.ingest("A inflação em 2023 foi de 4,62 por cento.");
    await s.ingest("A inflação em 2023 foi de 4,62 por cento.");
    expect(s.claims.size).toBe(1);
    expect(events.some((e) => e.type === "claim.removed")).toBe(true);
  });

  test("cross-session cache resolves instantly", async () => {
    const d = deps();
    await newSession(d).ingest("O Brasil ganhou cinco Copas do Mundo.");
    const s2 = newSession(d);
    await s2.ingest("O Brasil ganhou cinco Copas do Mundo.");
    const c = [...s2.claims.values()][0]!;
    expect(c.status).toBe("verified");
    expect(c.cached).toBe(true);
  });

  test("a claim that contradicts an earlier one is flagged CONTRADICTORY", async () => {
    const s = newSession();
    await s.ingest("O Brasil tem mais de 200 milhões de habitantes.");
    await s.ingest("O Brasil tem menos de 100 milhões de habitantes.");
    const verdicts = [...s.claims.values()].map((c) => c.result?.verdict);
    expect(verdicts).toContain("CONTRADICTORY");
  });

  test("verification errors surface as status=error", async () => {
    const d = deps();
    d.ai.verify = async () => {
      throw new Error("boom");
    };
    const s = newSession(d);
    await s.ingest("A Amazônia perdeu 10 mil km² de floresta.");
    const c = [...s.claims.values()][0]!;
    expect(c.status).toBe("error");
    expect(c.error).toBe("boom");
  });

  test("limiter caps concurrency", async () => {
    const l = new Limiter(2);
    let active = 0, peak = 0;
    await Promise.all(
      Array.from({ length: 6 }, () =>
        l.run(async () => {
          peak = Math.max(peak, ++active);
          await new Promise((r) => setTimeout(r, 5));
          active--;
        }),
      ),
    );
    expect(peak).toBe(2);
  });
});
