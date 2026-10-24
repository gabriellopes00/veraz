# Veraz

Real-time fact-checking. The phone streams the mic to the API, the API transcribes it live, extracts check-worthy claims, verifies each one with web search, and pushes verdicts back over one WebSocket.

```
apps/api/        Node + Fastify (pipeline, WebSocket, /metrics)
apps/mobile/     Expo + expo-router (Live screen, claim detail)
packages/shared/ zod schemas, verdict taxonomy, WS event types
```

Needs Node 24+ (it runs the TypeScript sources directly, no build step) and pnpm (`corepack enable`).

## Quick start (no API key)

```bash
pnpm install
MOCK_OPENAI=true pnpm dev:api        # fake transcripts and verdicts
pnpm test                            # schemas, dedup, WS flow, pipeline (mock)
MOCK_OPENAI=true pnpm replay         # sample PT-BR transcript, latency per stage
pnpm check                           # Biome: format + lint (pnpm lint to only report)
```

With a real key:

```bash
cp .env.example apps/api/.env        # set OPENAI_API_KEY, MOCK_OPENAI=false (API vars only)
pnpm dev:api
```

The API reads `apps/api/.env`; the mobile app reads `apps/mobile/.env` (the `EXPO_PUBLIC_*` vars). `.env.example` at the root lists both.

## Environment variables

| Var | Where | Default | Meaning |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | api | – | Required unless mock |
| `MOCK_OPENAI` | api | `false` | `true` = no network, fake data |
| `PORT` | api | `3000` | Listens on `0.0.0.0` |
| `MODEL_TRANSCRIBE` | api | `gpt-live-transcribe` | Realtime transcription. Streams text while you speak; `gpt-transcribe` waits for a pause (server VAD) |
| `MODEL_TRANSCRIBE_CHUNK` | api | `gpt-4o-mini-transcribe` | `chunked` mode |
| `MODEL_EXTRACT` / `MODEL_VERIFY` | api | `gpt-5.6-luna` | Claim extraction / verification |
| `MODEL_EMBED` | api | `text-embedding-3-small` | Dedup and cache |
| `EXTRACT_EFFORT` / `VERIFY_EFFORT` | api | `none` / `low` | Reasoning effort |
| `VERIFY_CONCURRENCY` / `VERIFY_TIMEOUT_MS` | api | `4` / `45000` | Parallel verifications, per-call timeout |
| `VAD_SILENCE_MS` | api | `400` | Silence that ends an utterance. Lower = faster, more cut sentences |
| `VAD_SPEECH_DB` / `VAD_MAX_TURN_MS` | api | `-45` / `12000` | `gpt-live-transcribe` turn detection: speech level in dBFS (raise it in noisy rooms), longest utterance before a forced cut |
| `DEDUP_THRESHOLD` / `CACHE_THRESHOLD` / `CACHE_TTL_HOURS` | api | `0.9` / `0.92` / `24` | Cosine thresholds, cache TTL |
| `DB_PATH` | api | `veraz.db` | SQLite verdict cache |
| `EXPO_PUBLIC_API_URL` | mobile | – | `http://<your LAN IP>:3000` |
| `EXPO_PUBLIC_AUDIO_MODE` | mobile | `pcm-stream` | `pcm-stream` or `chunked` |

Models and sources are plain config: [apps/api/src/config.ts](apps/api/src/config.ts), [apps/api/src/sources.ts](apps/api/src/sources.ts), prompts in [apps/api/prompts/](apps/api/prompts/).

## Run on your iPhone

1. Find your computer's LAN IP (phone and computer on the same Wi-Fi):
   - Linux: `hostname -I | awk '{print $1}'`
   - macOS: `ipconfig getifaddr en0`
   - Windows: `ipconfig` → IPv4 Address
2. Check the API is reachable from the phone: open `http://<ip>:3000/health` in Safari. If not, open port 3000 in your firewall.
3. Create `apps/mobile/.env`:
   ```
   EXPO_PUBLIC_API_URL=http://<ip>:3000
   EXPO_PUBLIC_AUDIO_MODE=pcm-stream
   ```

### Mode 1: `pcm-stream` (default, fastest) — needs a development build

Streams raw PCM16 mic frames (~100 ms) over the WebSocket using `expo-audio`'s `useAudioStream`; the API resamples to 24 kHz if needed and feeds the Realtime transcription session.

```bash
cd apps/mobile
pnpm exec expo run:ios --device   # needs Xcode + Apple developer account (free is OK); builds and installs on the iPhone
pnpm start:dev-client             # later runs: just start Metro and open the installed app
```

Alternative without a Mac: `pnpm dlx eas-cli build --profile development --platform ios` (EAS account required), then install on the device.

### Mode 2: `chunked` — works in Expo Go

Records 5 s `m4a` chunks back to back with `expo-audio`; each chunk is sent as a binary message and transcribed with the regular transcription endpoint. Slower (a chunk is only transcribed after it ends) and sentences can be cut at chunk borders.

```bash
cd apps/mobile
EXPO_PUBLIC_AUDIO_MODE=chunked pnpm exec expo start   # scan the QR code with Expo Go
```

The text box on the Live screen works in both modes and is the fastest way to test the pipeline.

## API

| Route | |
| --- | --- |
| `POST /sessions` | Body `{mode?: "pcm-stream"\|"chunked", sampleRate?}` → `{id}`. Opens the upstream Realtime connection right away so it is warm |
| `GET /sessions/:id` | Session state (claims, utterances) |
| `DELETE /sessions/:id` | End session |
| `GET /sessions/:id/ws` | Binary audio in; JSON events out (`snapshot`, `partial`, `utterance`, `claim`, `claim.removed`, `error`). Reconnecting returns a fresh `snapshot` |
| `POST /sessions/:id/text` | `{text}` injects an utterance (`?wait=1` waits until its claims settle) |
| `GET /metrics` | Latency and token usage |
| `GET /health` | |

```bash
ID=$(curl -s -XPOST localhost:3000/sessions | jq -r .id)
curl -XPOST "localhost:3000/sessions/$ID/text?wait=1" -H 'content-type: application/json' \
  -d '{"text":"A inflação em 2023 foi de 4,62 por cento."}'
curl -s localhost:3000/sessions/$ID | jq '.claims[0].result'
```

## Reading `/metrics`

```json
{
  "latencyMs": {
    "transcribe": { "n": 12, "p50": 310, "p95": 540 },
    "extract":    { "n": 12, "p50": 420, "p95": 800 },
    "verify":     { "n": 9,  "p50": 6200, "p95": 14000 },
    "total":      { "n": 9,  "p50": 7000, "p95": 15000 }
  },
  "eventLoopDelayMs": { "p50": 0, "p99": 1.2, "max": 4.8 },
  "tokens": { "extract": { "input": 0, "cached": 0, "output": 0, "reasoning": 0, "calls": 0 }, "verify": {}, "embed": {} },
  "claims": { "detected": 0, "verified": 0, "errors": 0, "cacheHits": 0, "duplicates": 0 }
}
```

- `transcribe`: end of speech (server VAD `speech_stopped`) → final transcript.
- `extract`: final transcript → claim detected (the card appears on the phone at this point).
- `verify`: claim detected → verdict.
- `total`: end of speech → verdict.
- `eventLoopDelayMs`: how long the event loop was blocked. Anything above a few ms slows every lane; move CPU work to a worker thread.
- `tokens.*.cached` shows how much input hit OpenAI prompt caching (prompts keep a byte-identical static prefix; variable content goes last).

`pnpm replay` prints the same stages per claim for a canned transcript (with `OPENAI_API_KEY` in `apps/api/.env` and `MOCK_OPENAI=false` for real numbers).

## Design notes

- **API layout**: two modules under [apps/api/src/modules/](apps/api/src/modules/). `transcription` turns audio into utterances; `factcheck` owns sessions, claims and verdicts. Every external service (OpenAI, SQLite) sits behind a port with a real and a mock adapter, and [container.ts](apps/api/src/container.ts) is the only place that picks one. See [CLAUDE.md](CLAUDE.md) for the conventions.
- **Hot lane / cold lane**: a claim card is pushed as soon as extraction returns; dedup, cache and verification run afterwards, in parallel, capped by `VERIFY_CONCURRENCY`. Ending a session aborts its in-flight model calls.

- **Models** (checked against the current OpenAI docs): `gpt-transcribe` for Realtime transcription (server VAD, `audio/pcm` 24 kHz); `gpt-5.6-luna` (the fast, small tier) with Structured Outputs for extraction and, with the `web_search` tool plus `allowed_domains` per topic, for verification; `text-embedding-3-small` for dedup and cache.
- **Sources are grounded**: the model's source list is filtered to URLs that appeared in `web_search` results or citations. If none survive, the verdict is downgraded to `UNVERIFIABLE`.
- **Cards appear before dedup/verification**; a duplicate is then removed with a `claim.removed` event.
- **Cache**: verdicts persist in SQLite and match by embedding similarity (TTL 24 h). `CONTRADICTORY` is session-specific and never cached.

## Known limitations

- Not yet run against the live OpenAI API or on a physical iPhone: the code follows the current docs, the mock flow, tests and the iOS bundle build pass, but model names, the Realtime event shapes and `expo-audio` streaming should be confirmed on first run. Check the API log for `[realtime]` errors if no transcript appears.
- If `gpt-transcribe` or `gpt-5.6-luna` is not available to your account, override `MODEL_*`.
- Verification takes seconds (it is a web search); expect the "verificando…" state for a while. Raise `VERIFY_EFFORT` for quality, keep it at `low` for speed.
- Sessions live in memory: a server restart drops them (the app starts a new one). Sessions are only freed by `DELETE`.
- `CONTRADICTORY` only considers verified claims from the same session; a cache hit skips that check.
- No speaker diarization, no auth, HTTP only on the LAN (local prototype).
- Dedup is by embedding similarity; paraphrases with different numbers may still be merged if similarity is above the threshold.
