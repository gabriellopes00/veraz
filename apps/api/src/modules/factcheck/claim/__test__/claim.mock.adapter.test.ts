import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { cosine } from "../../../../shared/vector.ts";
import { MockClaimEmbedder } from "../claim.mock.adapter.ts";

describe("mock embedder", () => {
  test("a paraphrase is close, an unrelated claim is far", async () => {
    const e = new MockClaimEmbedder();
    const [a, b, c] = await Promise.all([
      e.embed("O Brasil tem mais de 200 milhões de habitantes"),
      e.embed("O Brasil tem mais de 200 milhões de habitantes segundo o IBGE"),
      e.embed("A vacina da gripe causa autismo"),
    ]);
    assert.ok(cosine(a, b) > 0.85);
    assert.ok(cosine(a, c) < 0.5);
  });
});
