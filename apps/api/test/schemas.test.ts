import { describe, expect, test } from "bun:test";
import {
  VERDICTS,
  VERDICT_INFO,
  claimSchema,
  clientMessageSchema,
  createSessionSchema,
  extractionSchema,
  serverEventSchema,
  verificationSchema,
} from "@veraz/shared";
import { keepGroundedSources } from "../src/ai";
import { domainsFor, SOURCES_BY_CATEGORY } from "../src/sources";

describe("shared schemas", () => {
  test("every verdict has PT/EN labels, a color and a definition", () => {
    expect(VERDICTS).toHaveLength(12);
    for (const v of VERDICTS) {
      const i = VERDICT_INFO[v];
      expect(i.pt && i.en && i.definition).toBeTruthy();
      expect(i.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  test("extraction and verification parse valid payloads and reject bad ones", () => {
    expect(extractionSchema.safeParse({ claims: [{ quote: "a", claim: "b", category: "health", language: "pt" }] }).success).toBe(true);
    expect(extractionSchema.safeParse({ claims: [{ quote: "a", claim: "b", category: "cooking", language: "pt" }] }).success).toBe(false);
    const v = { verdict: "TRUE", confidence: 0.9, summary: "s", explanation: "e", sources: [] };
    expect(verificationSchema.safeParse(v).success).toBe(true);
    expect(verificationSchema.safeParse({ ...v, verdict: "MAYBE" }).success).toBe(false);
  });

  test("events and messages", () => {
    expect(serverEventSchema.safeParse({ type: "partial", text: "oi" }).success).toBe(true);
    expect(serverEventSchema.safeParse({ type: "nope" }).success).toBe(false);
    expect(clientMessageSchema.safeParse({ type: "text", text: "" }).success).toBe(false);
    expect(createSessionSchema.parse({})).toEqual({ mode: "pcm-stream", sampleRate: 24000 });
    expect(claimSchema.safeParse({ id: "1" }).success).toBe(false);
  });
});

describe("sources", () => {
  test("domains respect the limit, have no protocol and no duplicates", () => {
    for (const cat of Object.keys(SOURCES_BY_CATEGORY) as (keyof typeof SOURCES_BY_CATEGORY)[]) {
      const d = domainsFor(cat, 100);
      expect(d.length).toBeLessThanOrEqual(100);
      expect(new Set(d).size).toBe(d.length);
      expect(d.every((x) => !x.startsWith("http"))).toBe(true);
    }
    expect(domainsFor("politics", 5)).toHaveLength(5);
  });

  test("only URLs that came from a real search result survive", () => {
    const src = (url: string) => ({ title: "t", outlet: "o", url, published_at: null, stance: "supports" as const });
    const v = { verdict: "TRUE" as const, confidence: 0.9, summary: "s", explanation: "e", sources: [src("https://www.g1.globo.com/a?utm=1"), src("https://fake.com/x")] };
    const kept = keepGroundedSources(v, new Set(["g1.globo.com/a"]));
    expect(kept.sources.map((s) => s.url)).toEqual(["https://www.g1.globo.com/a?utm=1"]);
    const none = keepGroundedSources(v, new Set());
    expect(none.verdict).toBe("UNVERIFIABLE");
  });
});
