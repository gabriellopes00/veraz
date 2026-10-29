import { OpenAI } from "openai";
import type { Config } from "./config.ts";
import {
  type ClaimEmbedder,
  type ClaimExtractor,
  createFactcheckModule,
  OpenAIClaimEmbedder,
  OpenAIClaimExtractor,
  OpenAIVerifier,
  SqliteVerdictCache,
  type VerdictCache,
  type Verifier,
} from "./modules/factcheck/index.ts";
import { createFavoritesModule, type FavoriteRepository, SqliteFavoriteRepository } from "./modules/favorites/index.ts";
import { OpenAITranscription, type Transcription } from "./modules/transcription/index.ts";
import { Metrics } from "./shared/metrics.ts";

export interface Adapters {
  transcription: Transcription;
  extractor: ClaimExtractor;
  embedder: ClaimEmbedder;
  verifier: Verifier;
  cache: VerdictCache;
  favorites: FavoriteRepository;
}

/** Composition root: the only place that picks a concrete adapter for each port. */
export function createContainer(config: Config) {
  const metrics = new Metrics();
  const adapters: Adapters = {
    ...openAIAdapters(config, metrics),
    cache: new SqliteVerdictCache(config.dbPath, config.cache.ttlMs),
    favorites: new SqliteFavoriteRepository(config.dbPath),
  };
  const factcheck = createFactcheckModule({ ...adapters, metrics, config });
  const favorites = createFavoritesModule({ favorites: adapters.favorites, claims: factcheck.facade });
  return { config, metrics, factcheck, favorites };
}

export type Container = ReturnType<typeof createContainer>;

function openAIAdapters(config: Config, metrics: Metrics) {
  if (!config.openaiKey) throw new Error("OPENAI_API_KEY is missing");
  // One client for everything: keep-alive connections are reused across calls.
  const client = new OpenAI({ apiKey: config.openaiKey, maxRetries: 1 });
  return {
    transcription: new OpenAITranscription(client, config),
    extractor: new OpenAIClaimExtractor(client, config, metrics),
    embedder: new OpenAIClaimEmbedder(client, config.models.embed, metrics),
    verifier: new OpenAIVerifier(client, config, metrics),
  };
}
