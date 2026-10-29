// Public surface of the factcheck module: the facade and wiring, plus the adapters for the composition root.
export { OpenAIClaimEmbedder, OpenAIClaimExtractor } from "./claim/claim.openai.adapter.ts";
export type { ClaimEmbedder, ClaimExtractor } from "./claim/claim.ports.ts";
export {
  createFactcheckModule,
  type FactcheckDeps,
  type FactcheckFacade,
  type FactcheckModule,
} from "./factcheck.module.ts";
export { SqliteVerdictCache } from "./verification/verdict-cache.repository.ts";
export { OpenAIVerifier } from "./verification/verification.openai.adapter.ts";
export type { VerdictCache, Verifier } from "./verification/verification.ports.ts";
