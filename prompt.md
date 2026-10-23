# Build "Veraz" — real-time fact-checking app (monorepo, performance-first)

## Goal
The app listens to a live conversation through the phone mic and transcribes it in real time. It detects checkable factual claims and verifies each one against many reliable web sources. Each claim gets a nuanced verdict and is shown in a live list with its status, a short explanation, and the sources used.

It must work for any kind of discussion (politics, health, science, economy, sports, history, tech, everyday talk), not just politics. Primary language is Brazilian Portuguese, and English must also work; detect the language automatically.

This is a local prototype that I will test on my iPhone. Do not set up publishing, CI, Docker, or deployment.

**Top priority: speed.** The time from a person finishing a sentence to the claim card appearing should be as short as possible. Verdicts should arrive as fast as possible after that. Every architectural choice should reduce latency. Measure it, don't guess.

## Stack
- **Runtime/API**: Bun + Hono, TypeScript strict mode. Use Bun's native WebSocket through `hono/bun`, and `bun:sqlite` where persistence is needed.
- **AI**: OpenAI only, via the official `openai` SDK. Before choosing models and APIs, check the current OpenAI docs; do not rely on memory. Pick the fastest suitable model for each step and put all model choices in config.
- **Mobile**: React Native + Expo (latest SDK), TypeScript, expo-router.
- **Monorepo**: Bun workspaces.

```
veraz/
  apps/api/        # Bun + Hono
  apps/mobile/     # Expo
  packages/shared/ # zod schemas, verdict enum, WS event types (single source of truth)
  README.md
  .env.example
  package.json     # workspace scripts: dev:api, dev:mobile, test
```

## Backend pipeline (apps/api)
Run the pipeline per session, fully async and event-driven. Never poll and never use timers when an event exists.

1. **Streaming transcription**
   - The mobile app streams PCM16 mono audio frames (~100 ms each) as binary WebSocket messages to the API.
   - The API proxies them into an **OpenAI Realtime transcription session**, using the latest transcribe model and the server-side VAD.
   - Open the upstream connection when the session starts, so it's warm before the first word.
   - Forward partial transcripts to the client for display. Use completed utterances (VAD turn end) as the trigger for the next step.
   - Resample to the format the Realtime API requires; check the docs.

2. **Claim extraction**
   - Runs on each completed utterance, using the last few utterances as context.
   - Use the fastest small model with **Structured Outputs** (JSON schema generated from zod) and minimal reasoning effort.
   - Keep only check-worthy factual claims. Skip opinions, jokes, questions, and predictions.
   - Output for each claim: exact quote, a normalized self-contained claim (context and pronouns resolved), topic category, and language.
   - Push each claim to the client immediately with status `checking`.

3. **Deduplication and cache**
   - Embed each normalized claim with the small embeddings model and compare by cosine similarity in memory.
   - Skip duplicates within the session.
   - Keep a cross-session verdict cache in `bun:sqlite`, keyed by embedding similarity with a TTL, so repeated claims resolve instantly.

4. **Verification**
   - Use the **Responses API with the web_search tool**, with domain filtering set from the claim's topic category. Respect the tool's domain limit by choosing the most relevant domains per category.
   - Prefer at least 3 independent sources, and give existing fact-checks priority.
   - Use Structured Outputs: `verdict, confidence (0–1), summary (1–2 sentences), explanation, sources[] {title, outlet, url, published_at, stance: supports|refutes|context}`.
   - Every URL must come from an actual search result. Never invent sources.
   - Run verifications in parallel with a configurable concurrency limit and timeout.
   - Make the reasoning effort configurable, with a low default.

5. **Push**
   - Send each state change (`detected → checking → verified|error`) over the same WebSocket, as small typed JSON events.

**Performance rules**
- One persistent WebSocket per client, carrying binary audio frames, no base64.
- Keep static prompt prefixes byte-identical so OpenAI prompt caching applies. Put the variable content last.
- Reuse the OpenAI client and keep-alive connections. Never block the event loop.
- Validate with zod only at the boundaries.
- Log the latency of each stage per claim: utterance end → claim detected → verdict.
- Expose `GET /metrics` with p50/p95 latencies and token usage.

**Verdict taxonomy**
Define it in `packages/shared`, with PT and EN labels, colors, and precise definitions that are also used inside the prompts:
- `TRUE` (Verdadeiro)
- `TRUE_BUT` (Verdadeiro, mas…)
- `NOT_QUITE` (Não é bem assim)
- `EXAGGERATED` (Exagerado)
- `UNDERSTATED` (Subestimado)
- `DISTORTED` (Distorcido)
- `MISLEADING` (Enganoso)
- `FALSE` (Falso)
- `NO_EVIDENCE` (Sem provas)
- `CONTRADICTORY` (Contraditório): contradicts something said earlier in the same session
- `OUTDATED` (Desatualizado)
- `UNVERIFIABLE` (Não verificável)

**Sources**
Keep them in `sources.ts` (or YAML), grouped by topic category and easy to edit:
- Fact-checkers: Lupa, Aos Fatos, Estadão Verifica, UOL Confere, AFP Checamos, Projeto Comprova, Boatos.org, Reuters Fact Check, Snopes, PolitiFact, Full Fact
- News: G1, Folha, Estadão, BBC Brasil, Poder360, Reuters, AP, BBC
- Official data: IBGE, gov.br, BCB, TSE, IPEA, WHO, World Bank
- Science/health: Nature, Science, PubMed, Fiocruz, Butantan
- Sports, tech, and others as useful

**API**
- `POST /sessions` creates a session. `DELETE /sessions/:id` ends it.
- `GET /sessions/:id/ws` carries audio in and events out.
- `POST /sessions/:id/text` injects text, so the pipeline can be tested without the mic.
- `GET /sessions/:id` returns the session state.
- Bind to `0.0.0.0` so the phone can reach the API over the LAN.

**Dev and tests**
- `MOCK_OPENAI=true` runs the full flow with fake transcripts and verdicts, so it works without API keys.
- Add a script that replays a sample PT-BR transcript through the pipeline and prints the latency per stage.
- Write `bun test` tests for schemas, dedup, the WebSocket event flow, and the pipeline in mock mode.
- Keep prompts in `apps/api/prompts/`.

## Mobile (apps/mobile)
**Audio transport**
Put audio behind an interface with two implementations:
1. **`pcm-stream`** (default, fastest): stream raw PCM16 frames from the mic over the WebSocket. Use the best maintained library for this; it needs an Expo **development build**. Configure the iOS audio session and `NSMicrophoneUsageDescription`.
2. **`chunked`** (fallback that works in Expo Go): use `expo-audio` to record short back-to-back chunks and send each one. For this mode, the API transcribes each chunk with the regular transcription endpoint.

Select the mode with an env var, and document both in the README, including how to make a development build for an iPhone.

**API URL**
Read it from `EXPO_PUBLIC_API_URL`, which will be my machine's LAN IP.

**Screens**
1. **Live**:
   - Start/stop button and a recording indicator
   - Live transcript with partial text
   - Claim list that updates in real time, newest on top. Each card shows the quote, a colored verdict badge (or a "checking…" shimmer), and the source count.
   - Filter chips by verdict
   - A "type a claim" input for testing
2. **Claim detail**: quote, normalized claim, verdict with its definition, confidence, explanation, and sources (outlet, title, date, stance icon), opened with `expo-web-browser`.

**UI performance**
- Use `@shopify/flash-list` for the claim list.
- Keep a normalized store (zustand) keyed by claim id, with memoized cards, so a single update never re-renders the whole list.
- Reconnect automatically with backoff.
- Support dark mode and keep the UI clean and simple.

## Process
1. First show a short plan, the final folder tree, and which OpenAI models and APIs you chose and why, after checking the docs.
2. Build the backend first, with mock mode and tests passing.
3. Then build the mobile app.
4. Finish with the README: env vars, Bun commands, how to find my LAN IP, the dev build vs. Expo Go modes, how to read `/metrics`, and known limitations.