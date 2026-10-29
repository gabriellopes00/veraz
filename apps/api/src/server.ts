import websocket from "@fastify/websocket";
import Fastify, { type FastifyError } from "fastify";
import type { Container } from "./container.ts";
import { InvalidInputError, NotFoundError } from "./shared/errors.ts";

/** Builds the HTTP + WebSocket server without listening. */
export async function buildServer({ metrics, factcheck, favorites }: Container) {
  const app = Fastify();
  await app.register(websocket);

  // The one place where domain errors become HTTP statuses.
  app.setErrorHandler<FastifyError>((err, _req, reply) => {
    if (err instanceof NotFoundError) return reply.code(404).send({ error: err.message });
    if (err instanceof InvalidInputError) return reply.code(400).send({ error: err.message });
    if (err.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ error: err.message });
    console.error(err);
    return reply.code(500).send({ error: "internal error" });
  });

  app.get("/health", async () => ({ ok: true }));
  app.get("/metrics", async () => ({ ...metrics.snapshot(), sessions: factcheck.facade.count }));
  await app.register(factcheck.routes);
  await app.register(favorites.routes);

  return app;
}
