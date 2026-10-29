# Veraz

Real-time fact-checking. The phone streams mic audio over one WebSocket. The API transcribes it live, extracts check-worthy claims, verifies each one with web search, and pushes verdicts back on the same socket. Primary language is PT-BR; English must work too. This is a local prototype tested on an iPhone over the LAN: no deploy, CI or auth.

**Speed comes first.** Measure the time from the end of a sentence to the claim card, and from the card to the verdict. Don't trade that latency away for structure. [architecture.md](architecture.md) holds the target design (hot lane / cold lane). Treat it as direction, not a spec.

## Stack

- pnpm workspaces (`nodeLinker: hoisted`, the Expo default for pnpm), Node ≥ 24, TypeScript strict.
- `apps/api`: Fastify 5 + `@fastify/websocket`. Node runs the `.ts` sources directly (type stripping), so there is no build step and no tsx.
- `apps/mobile`: Expo (SDK 58) + expo-router, zustand, FlashList.
- `packages/shared`: zod schemas, verdict taxonomy, WS event types, PCM resampling. This is the wire contract for both apps.
- AI: OpenAI only, through the `openai` SDK (Realtime transcription, Responses API with Structured Outputs and `web_search`, embeddings). Model names live in [apps/api/src/config.ts](apps/api/src/config.ts).
- Biome for format + lint. No automated tests and no mocks: everything runs against the real OpenAI API.

## Commands (from the repo root)

```bash
pnpm install
pnpm dev:api        # API on :3000 (needs OPENAI_API_KEY in apps/api/.env)
pnpm dev:mobile     # Expo
pnpm typecheck      # tsc in every package
pnpm check          # biome format + lint, writes fixes (pnpm lint = report only)
pnpm replay         # canned PT-BR transcript through the real models, prints latency per stage
```

Before committing, run `pnpm check && pnpm typecheck`. The API reads `apps/api/.env` (`--env-file-if-exists`); variables set in the shell override it.

## API layout (`apps/api/src`)

It follows the `modular-design` skill in [.claude/skills/modular-design/](.claude/skills/modular-design/), deliberately kept small: modules with strong boundaries, organized flat-by-aggregate inside.

```
main.ts         bootstrap: container → server → listen
container.ts    composition root: the only file that instantiates adapters
server.ts       Fastify + websocket plugin, /health, /metrics, domain error → HTTP status
config.ts       every env var and model choice
shared/         small kernel: errors, Limiter, Metrics, cosine, OpenAI helpers (adapters only)
modules/
  transcription/   Transcription port + OpenAI Realtime adapter
  factcheck/       the core
    session/       FactcheckSession aggregate root, SessionService (pipeline), repository, routes
    claim/         ClaimExtractor / ClaimEmbedder ports + adapters
    verification/  Verifier / VerdictCache ports, OpenAI/SQLite adapters, grounding rule, sources
    factcheck.module.ts   wiring + FactcheckFacade
  favorites/       saved claims (SQLite `favorites_claims`); copies a claim from its session via FactcheckFacade
```

File suffixes name the layer: `.entity` (domain), `.service` (application), `.ports` / `.port` (interfaces in our own language), `.<vendor>.adapter` (infrastructure), `.repository` (state), `.routes` (transport).

Rules:
- Import another module only through its `index.ts`. Never reach into its files.
- Vendor SDKs (`openai`, `ws` as a client, `node:sqlite`) appear only in adapters and `container.ts`. A port's types are ours (from `@veraz/shared` or the port file), never the vendor's.
- Routes parse input with zod, call one service method, and map the result. Business rules belong in the entity or the service.
- Domain code throws `NotFoundError` / `InvalidInputError` (in `shared/errors.ts`). Only `server.ts` turns them into status codes.
- Claims change only through `FactcheckSession`, and every change is emitted as a `ServerEvent`.
- Persisted state carries its module's prefix (table `factcheck_verdicts`).
- Cross-module communication is a synchronous call through the port or facade, on purpose: everything is in-process and in memory. Don't add an event bus or outbox unless something really needs durability.

## TypeScript rules that Node type stripping forces

- Relative imports carry the `.ts` extension: `import { x } from "./foo.ts"`.
- Erasable syntax only (`erasableSyntaxOnly`): no `enum`, no `namespace`, no constructor parameter properties (`constructor(private x)`). Declare the field and assign it.
- Type-only imports must say so (`verbatimModuleSyntax`): `import type { X }` or `import { type X }`.
- `packages/shared` follows the same rules. Metro and the mobile tsconfig accept `.ts` specifiers.

## Performance rules (from the original spec)

- One persistent WebSocket per client, with binary PCM frames and no base64 on the client hop.
- The upstream Realtime connection opens when the session is created, so it is warm before the first word.
- The prompts in `apps/api/prompts/` are static prefixes and must stay byte-identical across calls so OpenAI prompt caching applies. Variable content goes last, in the user message.
- One OpenAI client reuses keep-alive connections. Never block the event loop (`/metrics` reports `eventLoopDelayMs`).
- Validate with zod at the boundaries only.
- A claim card is emitted before dedup and verification. Verifications run in parallel behind `Limiter`, and ending a session aborts its in-flight calls through the session's `AbortSignal`.
- Verification sources must come from real `web_search` results (`keepGroundedSources`). Never let the model invent URLs.

## Gotchas

- pnpm 12 enforces `minimumReleaseAge`: a package version published in the last 24h fails to install. Pin the previous version instead of adding exclusions.
- Keep `nodeLinker: hoisted`. Isolated installs break some React Native libraries.
- `pcm-stream` audio needs an Expo development build. `chunked` works in Expo Go.
- `EXPO_PUBLIC_API_URL` must be the machine's LAN IP, and the API binds to `0.0.0.0`.
- Changing anything in `packages/shared` changes the wire contract. Check `apps/mobile/src/store.ts` and `live.ts` along with the API.
- Sessions live in memory, so a restart drops them. The app sees close code 4004 and starts a new session.
- [prompt.md](prompt.md) is the original generation spec. It still says Bun + Hono, which is outdated. This file and the README are current.
