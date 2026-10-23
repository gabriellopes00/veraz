import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { ServerEvent } from "@veraz/shared";
import { createApp, websocket } from "../src/app";
import { VerdictCache } from "../src/cache";
import { createMockAI } from "../src/mock";

let server: ReturnType<typeof Bun.serve>;
let base: string;

beforeAll(() => {
  const app = createApp(createMockAI(), new VerdictCache(":memory:", 60_000));
  server = Bun.serve({ port: 0, fetch: app.fetch, websocket });
  base = `http://localhost:${server.port}`;
});
afterAll(() => server.stop(true));

const post = (path: string, body?: unknown) =>
  fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });

async function open(id: string) {
  const ws = new WebSocket(`ws://localhost:${server.port}/sessions/${id}/ws`);
  const events: ServerEvent[] = [];
  ws.onmessage = (m) => events.push(JSON.parse(String(m.data)));
  await new Promise((r) => (ws.onopen = r));
  const waitFor = async (pred: (e: ServerEvent) => boolean) => {
    for (let i = 0; i < 200; i++) {
      const e = events.find(pred);
      if (e) return e;
      await Bun.sleep(10);
    }
    throw new Error("timeout waiting for event: " + JSON.stringify(events));
  };
  return { ws, events, waitFor };
}

describe("HTTP + WebSocket flow", () => {
  test("session lifecycle", async () => {
    const { id } = (await (await post("/sessions", {})).json()) as { id: string };
    expect((await fetch(`${base}/sessions/${id}`)).status).toBe(200);
    expect((await fetch(`${base}/sessions/${id}`, { method: "DELETE" })).status).toBe(204);
    expect((await fetch(`${base}/sessions/${id}`)).status).toBe(404);
    expect((await post("/sessions", { mode: "bogus" })).status).toBe(400);
  });

  test("text injection streams claim events over the WebSocket", async () => {
    const { id } = (await (await post("/sessions", { mode: "chunked" })).json()) as { id: string };
    const { ws, events, waitFor } = await open(id);
    await waitFor((e) => e.type === "snapshot");

    expect((await post(`/sessions/${id}/text`, { text: "O Brasil tem mais de 200 milhões de habitantes." })).status).toBe(202);
    await waitFor((e) => e.type === "claim" && e.claim.status === "checking");
    const done = await waitFor((e) => e.type === "claim" && e.claim.status === "verified");
    expect(done.type === "claim" && done.claim.result?.sources.length).toBeGreaterThan(0);

    // text also works as a WS message
    ws.send(JSON.stringify({ type: "text", text: "A inflação em 2023 foi de 4,62 por cento." }));
    await waitFor((e) => e.type === "utterance" && e.utterance.text.includes("inflação"));
    ws.close();
    expect(events[0]!.type).toBe("snapshot");
  });

  test("binary audio frames produce partial + utterance + claims (pcm-stream)", async () => {
    const { id } = (await (await post("/sessions", { mode: "pcm-stream", sampleRate: 16000 })).json()) as { id: string };
    const { ws, waitFor } = await open(id);
    const frame = new Uint8Array(1600 * 2); // 100 ms @ 16 kHz
    for (let i = 0; i < 45; i++) ws.send(frame); // > 2 s of audio
    await waitFor((e) => e.type === "partial");
    await waitFor((e) => e.type === "utterance");
    ws.close();
  });

  test("reconnecting gets a snapshot with existing claims", async () => {
    const { id } = (await (await post("/sessions", { mode: "chunked" })).json()) as { id: string };
    await post(`/sessions/${id}/text?wait=1`, { text: "O Brasil ganhou cinco Copas do Mundo." });
    const { ws, waitFor } = await open(id);
    const snap = await waitFor((e) => e.type === "snapshot");
    expect(snap.type === "snapshot" && snap.claims.length).toBe(1);
    ws.close();
  });

  test("/metrics exposes percentiles", async () => {
    const m = (await (await fetch(`${base}/metrics`)).json()) as any;
    expect(m.latencyMs.total).toHaveProperty("p95");
    expect(m.claims.verified).toBeGreaterThan(0);
  });
});
