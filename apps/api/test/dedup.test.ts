import { describe, expect, test } from "bun:test";
import { cosine, resamplePcm16 } from "../src/audio";
import { VerdictCache } from "../src/cache";
import { createMockAI } from "../src/mock";

describe("dedup helpers", () => {
  test("cosine similarity", () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });

  test("mock embeddings: paraphrase is close, unrelated is far", async () => {
    const ai = createMockAI();
    const [a, b, c] = await Promise.all([
      ai.embed("O Brasil tem mais de 200 milhões de habitantes"),
      ai.embed("O Brasil tem mais de 200 milhões de habitantes segundo o IBGE"),
      ai.embed("A vacina da gripe causa autismo"),
    ]);
    expect(cosine(a!, b!)).toBeGreaterThan(0.85);
    expect(cosine(a!, c!)).toBeLessThan(0.5);
  });

  test("resample 16 kHz -> 24 kHz scales length by 1.5", () => {
    const pcm = new Uint8Array(new Int16Array(1600).fill(1000).buffer);
    const out = resamplePcm16(pcm, 16000, 24000);
    expect(out.byteLength / 2).toBe(2400);
    expect(new Int16Array(out.buffer)[100]).toBe(1000);
    expect(resamplePcm16(pcm, 24000, 24000)).toBe(pcm);
  });

  test("verdict cache matches by similarity and honours TTL", () => {
    const result = { verdict: "TRUE" as const, confidence: 1, summary: "", explanation: "", sources: [] };
    const cache = new VerdictCache(":memory:", 1000);
    cache.store("x", [1, 0, 0], result);
    expect(cache.lookup([0.99, 0.05, 0], 0.95)).toEqual(result);
    expect(cache.lookup([0, 1, 0], 0.95)).toBeNull();
    const expired = new VerdictCache(":memory:", -1);
    expired.store("x", [1, 0, 0], result);
    expect(expired.lookup([1, 0, 0], 0.95)).toBeNull();
  });
});
