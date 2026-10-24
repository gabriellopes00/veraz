import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { TurnDetector } from "../turn-detector.ts";

const RATE = 24000;
/** One 100 ms PCM16 frame: a square wave at `amplitude` (0 = silence). */
const frame = (amplitude: number) => {
  const pcm = new Int16Array(RATE / 10);
  for (let i = 0; i < pcm.length; i++) pcm[i] = i % 2 ? amplitude : -amplitude;
  return new Uint8Array(pcm.buffer);
};
const LOUD = frame(8000); // ≈ -12 dBFS
const QUIET = frame(0);

const detector = () => new TurnDetector({ speechDb: -45, silenceMs: 400, maxTurnMs: 2000 });
const feed = (d: TurnDetector, frames: Uint8Array[]) => frames.map((f) => d.push(f, RATE));

describe("TurnDetector", () => {
  test("commits after speech followed by enough silence", () => {
    const out = feed(detector(), [LOUD, LOUD, LOUD, QUIET, QUIET, QUIET, QUIET]);
    assert.deepEqual(
      out.map((r) => r.commit),
      [false, false, false, false, false, false, true],
    );
    assert.equal(out.at(-1)!.spoke, true);
  });

  test("a click is not a turn", () => {
    const out = feed(detector(), [LOUD, QUIET, QUIET, QUIET, QUIET, QUIET]);
    assert.ok(out.every((r) => !r.commit));
  });

  test("a nonstop speaker is committed at the first quiet frame after maxTurnMs", () => {
    const d = detector();
    const out = feed(d, [...Array(20).fill(LOUD), LOUD, QUIET]);
    assert.equal(
      out.findIndex((r) => r.commit),
      21,
    );
  });

  test("hard cap commits even without a pause", () => {
    const out = feed(detector(), Array(80).fill(LOUD));
    assert.equal(
      out.findIndex((r) => r.commit),
      69,
    );
  });
});
