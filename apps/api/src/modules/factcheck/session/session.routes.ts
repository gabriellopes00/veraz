import { clientMessageSchema, createSessionSchema } from "@veraz/shared";
import type { FastifyPluginAsync } from "fastify";
import type { RawData } from "ws";
import type { z } from "zod";
import { InvalidInputError, NotFoundError } from "../../../shared/errors.ts";
import type { SessionService } from "./session.service.ts";

interface ById {
  Params: { id: string };
}

/** HTTP + WebSocket transport. Parses input, calls one service operation, maps the result. */
export const sessionRoutes =
  (sessions: SessionService): FastifyPluginAsync =>
  async (app) => {
    app.post("/sessions", async (req, reply) => {
      const id = sessions.start(parse(createSessionSchema, req.body ?? {}));
      return reply.code(201).send({ id });
    });

    app.get<ById>("/sessions/:id", async (req) => sessions.state(req.params.id));

    app.delete<ById>("/sessions/:id", async (req, reply) => {
      sessions.end(req.params.id);
      return reply.code(204).send();
    });

    // Idempotent: a claim already gone (deleted, or dropped as a duplicate) still gets 204.
    app.delete<{ Params: { id: string; claimId: string } }>("/sessions/:id/claims/:claimId", async (req, reply) => {
      sessions.removeClaim(req.params.id, req.params.claimId);
      return reply.code(204).send();
    });

    // The verdict arrives over the WebSocket, like the first one.
    app.post<{ Params: { id: string; claimId: string } }>(
      "/sessions/:id/claims/:claimId/recheck",
      async (req, reply) => {
        void sessions.recheck(req.params.id, req.params.claimId);
        return reply.code(202).send({ ok: true });
      },
    );

    app.post<ById & { Querystring: { wait?: string } }>("/sessions/:id/text", async (req, reply) => {
      const body = typeof req.body === "object" ? req.body : {};
      const msg = parse(clientMessageSchema, { type: "text", ...body });
      const done = sessions.ingestText(req.params.id, msg.text);
      if (req.query.wait === "1") await done; // handy for tests and scripts
      return reply.code(202).send({ ok: true });
    });

    // Binary audio in, JSON events out. The session outlives the socket, so the client can reconnect.
    app.get<ById>("/sessions/:id/ws", { websocket: true }, (socket, req) => {
      const { id } = req.params;
      const send = (e: unknown) => socket.send(JSON.stringify(e));
      const closeIfGone = (e: unknown) => {
        if (!(e instanceof NotFoundError)) throw e;
        socket.close(4004, "session not found"); // the client starts a fresh session
      };

      let unsubscribe = () => {};
      try {
        unsubscribe = sessions.subscribe(id, send);
      } catch (e) {
        return closeIfGone(e);
      }

      socket.on("message", (data, isBinary) => {
        try {
          if (isBinary) return sessions.receiveAudio(id, toBytes(data));
          const msg = clientMessageSchema.safeParse(safeJson(data.toString()));
          if (msg.success) void sessions.ingestText(id, msg.data.text);
          else send({ type: "error", message: "invalid message" });
        } catch (e) {
          closeIfGone(e);
        }
      });
      socket.on("close", () => unsubscribe());
    });
  };

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new InvalidInputError(result.error.message);
  return result.data;
}

const toBytes = (data: RawData): Uint8Array =>
  Array.isArray(data) ? Buffer.concat(data) : data instanceof ArrayBuffer ? new Uint8Array(data) : data;

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
