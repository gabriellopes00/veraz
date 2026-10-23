import { Hono } from "hono";
import { upgradeWebSocket, websocket } from "hono/bun";
import { clientMessageSchema, createSessionSchema } from "@veraz/shared";
import type { AI } from "./ai";
import type { VerdictCache } from "./cache";
import { config } from "./config";
import { metrics } from "./metrics";
import { Limiter, Session } from "./session";

export { websocket };

export function createApp(ai: AI, cache: VerdictCache) {
  const sessions = new Map<string, Session>();
  const limiter = new Limiter(config.verify.concurrency);
  const app = new Hono();

  const find = (id: string) => sessions.get(id);

  app.get("/health", (c) => c.json({ ok: true, mock: config.mock }));
  app.get("/metrics", (c) => c.json({ ...metrics.snapshot(), sessions: sessions.size }));

  app.post("/sessions", async (c) => {
    const body = createSessionSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: body.error.message }, 400);
    const session = new Session(body.data, { ai, cache, limiter });
    sessions.set(session.id, session);
    return c.json({ id: session.id }, 201);
  });

  app.get("/sessions/:id", (c) => {
    const s = find(c.req.param("id"));
    return s ? c.json(s.state()) : c.json({ error: "not found" }, 404);
  });

  app.delete("/sessions/:id", (c) => {
    const s = find(c.req.param("id"));
    if (!s) return c.json({ error: "not found" }, 404);
    s.close();
    sessions.delete(s.id);
    return c.body(null, 204);
  });

  app.post("/sessions/:id/text", async (c) => {
    const s = find(c.req.param("id"));
    if (!s) return c.json({ error: "not found" }, 404);
    const msg = clientMessageSchema.safeParse({ type: "text", ...(await c.req.json().catch(() => ({}))) });
    if (!msg.success) return c.json({ error: msg.error.message }, 400);
    const done = s.ingest(msg.data.text);
    if (c.req.query("wait") === "1") await done; // handy for tests and scripts
    return c.json({ ok: true }, 202);
  });

  app.get(
    "/sessions/:id/ws",
    upgradeWebSocket((c) => {
      const s = find(c.req.param("id")!);
      let unsubscribe = () => {};
      return {
        onOpen(_e, ws) {
          if (!s) return ws.close(4004, "session not found");
          unsubscribe = s.subscribe((e) => ws.send(JSON.stringify(e)));
        },
        onMessage(e, ws) {
          if (!s) return;
          if (typeof e.data === "string") {
            const msg = clientMessageSchema.safeParse(safeJson(e.data));
            if (msg.success) void s.ingest(msg.data.text);
            else ws.send(JSON.stringify({ type: "error", message: "invalid message" }));
            return;
          }
          const frame = new Uint8Array(e.data as ArrayBuffer);
          if (s.opts.mode === "chunked") void s.chunk(frame);
          else s.audio(frame);
        },
        onClose() {
          unsubscribe(); // the session survives so the client can reconnect
        },
      };
    }),
  );

  return app;
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
