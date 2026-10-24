import { OpenAI } from "openai";
import type { Config } from "./config.ts";
import {
  type ClaimEmbedder,
  type ClaimExtractor,
  createFactcheckModule,
  MockClaimEmbedder,
  MockClaimExtractor,
  MockVerifier,
  OpenAIClaimEmbedder,
  OpenAIClaimExtractor,
  OpenAIVerifier,
  SqliteVerdictCache,
  type VerdictCache,
  type Verifier,
} from "./modules/factcheck/index.ts";
import { MockTranscription, OpenAITranscription, type Transcription } from "./modules/transcription/index.ts";
import { Metrics } from "./shared/metrics.ts";

export interface Adapters {
  transcription: Transcription;
  extractor: ClaimExtractor;
  embedder: ClaimEmbedder;
  verifier: Verifier;
  cache: VerdictCache;
}

/** Composition root: the only place that picks a concrete adapter for each port. */
export function createContainer(config: Config, overrides: Partial<Adapters> = {}) {
  const metrics = new Metrics();
  const adapters: Adapters = {
    ...(config.mock ? mockAdapters() : openAIAdapters(config, metrics)),
    cache: overrides.cache ?? new SqliteVerdictCache(config.dbPath, config.cache.ttlMs),
    ...overrides,
  };
  const factcheck = createFactcheckModule({ ...adapters, metrics, config });
  return { config, metrics, factcheck };
}

export type Container = ReturnType<typeof createContainer>;

/** Same pipeline, no network, no keys (MOCK_OPENAI=true). */
const mockAdapters = () => ({
  transcription: new MockTranscription(),
  extractor: new MockClaimExtractor(),
  embedder: new MockClaimEmbedder(),
  verifier: new MockVerifier(),
});

function openAIAdapters(config: Config, metrics: Metrics) {
  if (!config.openaiKey) throw new Error("OPENAI_API_KEY is missing (or set MOCK_OPENAI=true)");
  // One client for everything: keep-alive connections are reused across calls.
  const client = new OpenAI({ apiKey: config.openaiKey, maxRetries: 1 });
  return {
    transcription: new OpenAITranscription(client, config),
    extractor: new OpenAIClaimExtractor(client, config, metrics),
    embedder: new OpenAIClaimEmbedder(client, config.models.embed, metrics),
    verifier: new OpenAIVerifier(client, config, metrics),
  };
}
