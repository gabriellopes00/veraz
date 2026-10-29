const env = process.env;
const parseEnvNum = (v: string | undefined, d: number) => (v ? Number(v) : d);

export const config = {
  port: parseEnvNum(env.PORT, 3000),
  /** 0.0.0.0 so the phone can reach the API over the LAN. */
  host: env.HOST ?? "0.0.0.0",
  openaiKey: env.OPENAI_API_KEY ?? "",
  dbPath: env.DB_PATH ?? "veraz.db",

  models: {
    /**
     * Realtime transcription. `gpt-live-transcribe` streams text while the speaker talks (turns detected locally);
     * `gpt-transcribe` / `gpt-4o-*-transcribe` use server VAD and only transcribe once the speaker pauses.
     */
    transcribe: env.MODEL_TRANSCRIBE ?? "gpt-live-transcribe",
    /** Used for `chunked` mode (regular /audio/transcriptions endpoint). */
    transcribeChunk: env.MODEL_TRANSCRIBE_CHUNK ?? "gpt-4o-mini-transcribe",
    extract: env.MODEL_EXTRACT ?? "gpt-5.6-luna",
    verify: env.MODEL_VERIFY ?? "gpt-5.6-luna",
    embed: env.MODEL_EMBED ?? "text-embedding-3-small",
  },

  /** Reasoning effort: none | minimal | low | medium | high ... */
  extractEffort: env.EXTRACT_EFFORT ?? "none",
  verifyEffort: env.VERIFY_EFFORT ?? "low",

  vad: {
    silenceMs: parseEnvNum(env.VAD_SILENCE_MS, 400),
    /** Server VAD only (`gpt-transcribe` and older). */
    threshold: parseEnvNum(env.VAD_THRESHOLD, 0.5),
    /** Local turn detection (`gpt-live-transcribe`): speech level, and the longest turn before a forced commit. */
    speechDb: parseEnvNum(env.VAD_SPEECH_DB, -45),
    maxTurnMs: parseEnvNum(env.VAD_MAX_TURN_MS, 12_000),
  },

  context: { utterances: 4, priorClaims: 8 },
  verify: {
    concurrency: parseEnvNum(env.VERIFY_CONCURRENCY, 4),
    timeoutMs: parseEnvNum(env.VERIFY_TIMEOUT_MS, 45_000),
    maxDomains: 100, // web_search allowed_domains limit
  },
  dedup: { threshold: parseEnvNum(env.DEDUP_THRESHOLD, 0.9) },
  cache: { threshold: parseEnvNum(env.CACHE_THRESHOLD, 0.92), ttlMs: parseEnvNum(env.CACHE_TTL_HOURS, 24) * 3_600_000 },
};

export type Config = typeof config;
