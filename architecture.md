# Real-Time Fact-Checking App: Architecture (Node.js)

## Core principle

Split the system into two lanes:

- **Hot lane** (audio → transcript → claim): must never wait on anything.
- **Cold lane** (verification): runs in parallel and can never slow the hot lane down.

Priority: transcription and claim identification come first. Verification should still be as fast as possible but is secondary.

## Stack

- **API:** Node 24/26 LTS, TypeScript, Fastify + Websockets plugin.
- **Mobile:** an Expo dev build with a library that emits raw PCM audio chunks.
- **Speech-to-text:** a streaming provider with interim results and fast end-of-speech detection.
  - Deepgram Flux and Nova-3 are strong candidates, with sub-300ms streaming and the fastest end-of-speech detection in one 2026 comparison ([source](https://futureagi.com/blog/speech-to-text-apis-in-2026-benchmarks-pricing-developer-s-decision-guide)).
  - Also test AssemblyAI and ElevenLabs Scribe v2, in the language your users will actually speak.
- **Claim extraction:** a small, fast model with structured output (Claude Haiku, Gemini Flash-Lite, or an open model on Groq or Cerebras).
- **Search:** an agent-oriented search API.
  - In a September 2026 benchmark, Parallel turbo averaged 348ms on factual lookups, with Exa Instant next at 398ms ([source](https://parallel.ai/ai/articles/best-web-search-api)).
  - Linkup Flash targets latency-critical apps like real-time voice agents ([source](https://www.vktr.com/ai-platforms/linkup-flash-delivers-sub-200ms-web-search-for-ai-agents/)).
  - Most of these numbers come from the vendors themselves, so benchmark them on your own claims.
- **Supporting pieces:**
  - Redis for the verdict cache.
  - Postgres with Drizzle for history.
  - OpenTelemetry for per-stage latency.
- **Monorepo:** pnpm with Turborepo, plus shared Zod event schemas used by both the app and the API.

## Hot lane (transcription and claim detection)

1. **Pre-connect.** Open the app's WebSocket and the upstream speech-to-text socket when the record screen opens, not when the user taps record.
2. **Stream binary PCM** (16kHz mono) in 20–50ms frames. Skip base64 and JSON wrapping, and capture at the sample rate the speech model expects so nothing needs resampling.
3. **Watch the network hops.** Host the API in the same region as your AI providers. If the phone-to-server hop is too slow (Brazil to US East adds roughly 120ms+ round trip), have the phone stream directly to the speech provider with a short-lived token and send only text to your API.
4. **Display interim transcripts immediately,** but run claim detection on final segments. Tune end-of-speech detection low (around 300ms), which gives faster but more fragmented sentences.
5. **Start extraction speculatively.** If an interim segment stays unchanged for about 250ms, start extracting from it, and cancel with `AbortController` if the final text differs.
6. **Send the last 3–5 sentences as context** so pronouns resolve, and require self-contained claims ("Brazil's inflation was 4% in 2025", not "it was 4%").
7. **Have the same LLM call output each claim plus 1–3 search queries.** This saves a full LLM round trip in verification.
8. **Stream the LLM output and emit each claim as soon as its JSON object closes,** using a partial-JSON parser rather than waiting for the full response.
9. **Keep the prompt prefix static** so prompt caching cuts time-to-first-token.
10. **Dedupe claims** by normalized hash or embedding similarity before verifying.

## Cold lane (verification)

- **Verify in-process, not through a job queue.** Run each check as a promise behind a concurrency limiter like `p-limit`, since queues add latency. Switch to BullMQ only if you need durability.
- **Fire all search queries in parallel** and start the verdict as soon as enough snippets arrive.
- **Give the verdict model only the top snippets.** Smaller context means a faster answer. Have it return a verdict, a confidence score and source URLs.
- **Use two passes.** Show a fast verdict first, and if confidence is low, escalate to a deeper search or a stronger model and update the status (verifying → likely false → false).
- **Cache verdicts in Redis**, since popular claims repeat across users.
- **Use keep-alive connections** to the search and LLM APIs, and warm them up at session start.

## Node specifics

- **Keep the event loop free.** Move any CPU work (voice activity detection, resampling, encoding) to `worker_threads`, and monitor loop delay with `perf_hooks.monitorEventLoopDelay`.
- **Pass one `AbortController` per session** through every call, so everything is cancelled when the user disconnects.

## Events on one WebSocket

- `transcript.partial`
- `transcript.final`
- `claim.detected`: id, text, span, status `verifying`
- `claim.updated`: verdict, confidence, sources

## Rough latency after the speaker finishes a sentence

- **Final transcript:** about 300–600ms.
- **Claim shown:** about 0.3–0.8s after that.
- **Verdict:** about 1–3s after that.