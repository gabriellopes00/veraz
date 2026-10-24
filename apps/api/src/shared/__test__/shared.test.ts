import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { Limiter } from "../limiter.ts";
import { cosine } from "../vector.ts";

describe("cosine", () => {
  test("identical, orthogonal and zero vectors", () => {
    assert.ok(Math.abs(cosine([1, 0], [1, 0]) - 1) < 1e-9);
    assert.ok(Math.abs(cosine([1, 0], [0, 1])) < 1e-9);
    assert.equal(cosine([0, 0], [1, 1]), 0);
  });
});

describe("Limiter", () => {
  test("caps concurrency, also when new work arrives as a slot frees up", async () => {
    const l = new Limiter(2);
    let active = 0;
    let peak = 0;
    const task = () =>
      l.run(async () => {
        peak = Math.max(peak, ++active);
        await sleep(5);
        active--;
      });
    const first = Array.from({ length: 6 }, task);
    await sleep(6);
    await Promise.all([...first, task(), task()]);
    assert.equal(peak, 2);
  });
});
