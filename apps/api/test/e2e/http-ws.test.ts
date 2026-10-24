import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import type { ServerEvent } from "@veraz/shared";
import { config } from "../../src/config.ts";
import { createContainer } from "../../src/container.ts";
import { buildServer } from "../../src/server.ts";

let app: Awaited<ReturnType<typeof buildServer>>;
let base: string;

before(async () => {
  app = await buildServer(createContainer({ ...config, mock: true, dbPath: ":memory:" }));
  await app.listen({ host: "127.0.0.1", port: 0 });
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
after(() => app.close());

const post = (path: string, body?: unknown) =>
  fetch(base + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });

const createSession = async (body: unknown) => ((await (await post("/sessions", body)).json()) as { id: string }).id;

async function open(id: string) {
  const ws = new WebSocket(`${base.replace("http", "ws")}/sessions/${id}/ws`);
  const events: ServerEvent[] = [];
  let closeCode: number | null = null;
  ws.onmessage = (m) => events.push(JSON.parse(String(m.data)));
  ws.onclose = (e) => {
    closeCode = e.code;
  };
  await new Promise((r) => {
    ws.onopen = r;
  });
  const waitFor = async (pred: (e: ServerEvent) => boolean) => {
    for (let i = 0; i < 200; i++) {
      const e = events.find(pred);
      if (e) return e;
      await sleep(10);
    }
    throw new Error(`timeout waiting for event: ${JSON.stringify(events)}`);
  };
  const closed = async () => {
    for (let i = 0; i < 200 && closeCode === null; i++) await sleep(10);
    return closeCode;
  };
  return { ws, events, waitFor, closed };
}

describe("HTTP + WebSocket flow", () => {
  test("session lifecycle", async () => {
    const id = await createSession({});
    assert.equal((await fetch(`${base}/sessions/${id}`)).status, 200);
    assert.equal((await fetch(`${base}/sessions/${id}`, { method: "DELETE" })).status, 204);
    assert.equal((await fetch(`${base}/sessions/${id}`)).status, 404);
    assert.equal((await post("/sessions", { mode: "bogus" })).status, 400);
    assert.equal((await post(`/sessions/${id}/text`, { text: "x" })).status, 404);
  });

  test("text injection streams claim events over the WebSocket", async () => {
    const id = await createSession({ mode: "chunked" });
    const { ws, events, waitFor } = await open(id);
    await waitFor((e) => e.type === "snapshot");

    assert.equal(
      (await post(`/sessions/${id}/text`, { text: "O Brasil tem mais de 200 milhões de habitantes." })).status,
      202,
    );
    await waitFor((e) => e.type === "claim" && e.claim.status === "checking");
    const done = await waitFor((e) => e.type === "claim" && e.claim.status === "verified");
    assert.ok(done.type === "claim" && done.claim.result!.sources.length > 0);

    // text also works as a WS message; garbage gets an error event
    ws.send(JSON.stringify({ type: "text", text: "A inflação em 2023 foi de 4,62 por cento." }));
    await waitFor((e) => e.type === "utterance" && e.utterance.text.includes("inflação"));
    ws.send("not json");
    await waitFor((e) => e.type === "error");
    ws.close();
    assert.equal(events[0]!.type, "snapshot");
  });

  test("binary audio frames produce partial + utterance + claims (pcm-stream)", async () => {
    const id = await createSession({ mode: "pcm-stream", sampleRate: 16000 });
    const { ws, waitFor } = await open(id);
    const frame = new Uint8Array(1600 * 2); // 100 ms @ 16 kHz
    for (let i = 0; i < 45; i++) ws.send(frame); // > 2 s of audio
    await waitFor((e) => e.type === "partial");
    await waitFor((e) => e.type === "utterance");
    ws.close();
  });

  test("reconnecting gets a snapshot with existing claims", async () => {
    const id = await createSession({ mode: "chunked" });
    await post(`/sessions/${id}/text?wait=1`, { text: "O Brasil ganhou cinco Copas do Mundo." });
    const { ws, waitFor } = await open(id);
    const snap = await waitFor((e) => e.type === "snapshot");
    assert.equal(snap.type === "snapshot" && snap.claims.length, 1);
    ws.close();
  });

  test("an unknown session closes the socket with 4004", async () => {
    const { closed } = await open("nope");
    assert.equal(await closed(), 4004);
  });

  test("/metrics exposes percentiles", async () => {
    const m = (await (await fetch(`${base}/metrics`)).json()) as {
      latencyMs: Record<string, { p95: number | null }>;
      claims: { verified: number };
    };
    assert.ok("p95" in m.latencyMs.total!);
    assert.ok(m.claims.verified > 0);
  });
});
