import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  claimSchema,
  clientMessageSchema,
  createSessionSchema,
  extractionSchema,
  resamplePcm16,
  serverEventSchema,
  VERDICT_INFO,
  VERDICTS,
  verificationSchema,
} from "../src/index.ts";

describe("verdict taxonomy", () => {
  test("every verdict has PT/EN labels, a color and a definition", () => {
    assert.equal(VERDICTS.length, 12);
    for (const v of VERDICTS) {
      const i = VERDICT_INFO[v];
      assert.ok(i.pt && i.en && i.definition, v);
      assert.match(i.color, /^#[0-9a-f]{6}$/i);
    }
  });
});

describe("schemas", () => {
  test("extraction and verification parse valid payloads and reject bad ones", () => {
    const claim = { quote: "a", claim: "b", category: "health", language: "pt" };
    assert.ok(extractionSchema.safeParse({ claims: [claim] }).success);
    assert.ok(!extractionSchema.safeParse({ claims: [{ ...claim, category: "cooking" }] }).success);
    const v = { verdict: "TRUE", confidence: 0.9, summary: "s", explanation: "e", sources: [] };
    assert.ok(verificationSchema.safeParse(v).success);
    assert.ok(!verificationSchema.safeParse({ ...v, verdict: "MAYBE" }).success);
  });

  test("events and messages", () => {
    assert.ok(serverEventSchema.safeParse({ type: "partial", text: "oi" }).success);
    assert.ok(!serverEventSchema.safeParse({ type: "nope" }).success);
    assert.ok(!clientMessageSchema.safeParse({ type: "text", text: "" }).success);
    assert.deepEqual(createSessionSchema.parse({}), { mode: "pcm-stream", sampleRate: 24000 });
    assert.ok(!claimSchema.safeParse({ id: "1" }).success);
  });
});

describe("audio", () => {
  test("resample 16 kHz -> 24 kHz scales length by 1.5", () => {
    const pcm = new Uint8Array(new Int16Array(1600).fill(1000).buffer);
    const out = resamplePcm16(pcm, 16000, 24000);
    assert.equal(out.byteLength / 2, 2400);
    assert.equal(new Int16Array(out.buffer)[100], 1000);
    assert.equal(resamplePcm16(pcm, 24000, 24000), pcm);
  });
});
