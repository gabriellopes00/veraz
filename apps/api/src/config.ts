const env = process.env;
const num = (v: string | undefined, d: number) => (v ? Number(v) : d);

export const config = {
  port: num(env.PORT, 3000),
  /** 0.0.0.0 so the phone can reach the API over the LAN. */
  host: env.HOST ?? "0.0.0.0",
  mock: env.MOCK_OPENAI === "true",
  openaiKey: env.OPENAI_API_KEY ?? "",
  dbPath: env.DB_PATH ?? "veraz.db",

  models: {
    /** Realtime transcription (supports server VAD, detects language). */
    transcribe: env.MODEL_TRANSCRIBE ?? "gpt-transcribe",
    /** Used for `chunked` mode (regular /audio/transcriptions endpoint). */
    transcribeChunk: env.MODEL_TRANSCRIBE_CHUNK ?? "gpt-4o-mini-transcribe",
    extract: env.MODEL_EXTRACT ?? "gpt-5.6-luna",
    verify: env.MODEL_VERIFY ?? "gpt-5.6-luna",
    embed: env.MODEL_EMBED ?? "text-embedding-3-small",
  },

  /** Reasoning effort: none | minimal | low | medium | high ... */
  extractEffort: env.EXTRACT_EFFORT ?? "none",
  verifyEffort: env.VERIFY_EFFORT ?? "low",

  vad: { silenceMs: num(env.VAD_SILENCE_MS, 400), threshold: num(env.VAD_THRESHOLD, 0.5) },

  context: { utterances: 4, priorClaims: 8 },
  verify: {
    concurrency: num(env.VERIFY_CONCURRENCY, 4),
    timeoutMs: num(env.VERIFY_TIMEOUT_MS, 45_000),
    maxDomains: 100, // web_search allowed_domains limit
  },
  dedup: { threshold: num(env.DEDUP_THRESHOLD, 0.9) },
  cache: { threshold: num(env.CACHE_THRESHOLD, 0.92), ttlMs: num(env.CACHE_TTL_HOURS, 24) * 3_600_000 },
};

export type Config = typeof config;
