import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Category, Verification } from "@veraz/shared";
import { SqliteVerdictCache } from "../verdict-cache.repository.ts";
import { keepGroundedSources } from "../verification.grounding.ts";
import { domainsFor, SOURCES_BY_CATEGORY } from "../verification.sources.ts";

const verdict = (v: Partial<Verification> = {}): Verification => ({
  verdict: "TRUE",
  confidence: 0.9,
  summary: "s",
  explanation: "e",
  sources: [],
  ...v,
});

describe("sources", () => {
  test("domains respect the limit, have no protocol and no duplicates", () => {
    for (const cat of Object.keys(SOURCES_BY_CATEGORY) as Category[]) {
      const d = domainsFor(cat, 100);
      assert.ok(d.length <= 100);
      assert.equal(new Set(d).size, d.length);
      assert.ok(d.every((x) => !x.startsWith("http")));
    }
    assert.equal(domainsFor("politics", 5).length, 5);
  });
});

describe("grounding", () => {
  test("only URLs that came from a real search result survive", () => {
    const src = (url: string) => ({ title: "t", outlet: "o", url, published_at: null, stance: "supports" as const });
    const v = verdict({ sources: [src("https://www.g1.globo.com/a?utm=1"), src("https://fake.com/x")] });
    const kept = keepGroundedSources(v, new Set(["g1.globo.com/a"]));
    assert.deepEqual(
      kept.sources.map((s) => s.url),
      ["https://www.g1.globo.com/a?utm=1"],
    );
    assert.equal(keepGroundedSources(v, new Set()).verdict, "UNVERIFIABLE");
  });
});

describe("verdict cache", () => {
  test("matches by similarity and honours the TTL", () => {
    const result = verdict();
    const cache = new SqliteVerdictCache(":memory:", 1000);
    cache.store("x", [1, 0, 0], result);
    assert.deepEqual(cache.lookup([0.99, 0.05, 0], 0.95), result);
    assert.equal(cache.lookup([0, 1, 0], 0.95), null);
    const expired = new SqliteVerdictCache(":memory:", -1);
    expired.store("x", [1, 0, 0], result);
    assert.equal(expired.lookup([1, 0, 0], 0.95), null);
  });
});
