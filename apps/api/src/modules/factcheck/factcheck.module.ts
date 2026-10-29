import type { FastifyPluginAsync } from "fastify";
import { Limiter } from "../../shared/limiter.ts";
import { SessionRepository } from "./session/session.repository.ts";
import { sessionRoutes } from "./session/session.routes.ts";
import { SessionService, type SessionServiceDeps } from "./session/session.service.ts";

/** Everything the rest of the API may do with fact-checking sessions. */
export type FactcheckFacade = Pick<
  SessionService,
  | "start"
  | "state"
  | "claim"
  | "removeClaim"
  | "recheck"
  | "verify"
  | "subscribe"
  | "end"
  | "receiveAudio"
  | "ingestText"
  | "count"
>;

export interface FactcheckModule {
  facade: FactcheckFacade;
  routes: FastifyPluginAsync;
}

export type FactcheckDeps = Omit<SessionServiceDeps, "sessions" | "limiter">;

export function createFactcheckModule(deps: FactcheckDeps): FactcheckModule {
  const service = new SessionService({
    ...deps,
    sessions: new SessionRepository(),
    limiter: new Limiter(deps.config.verify.concurrency),
  });
  return { facade: service, routes: sessionRoutes(service) };
}
