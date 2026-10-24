import type { Verification } from "@veraz/shared";
import type { Config } from "../../../config.ts";
import { errorMessage } from "../../../shared/errors.ts";
import type { Limiter } from "../../../shared/limiter.ts";
import type { Metrics } from "../../../shared/metrics.ts";
import type { Transcription } from "../../transcription/index.ts";
import type { ClaimEmbedder, ClaimExtractor, ExtractedClaim } from "../claim/claim.ports.ts";
import type { VerdictCache, Verifier } from "../verification/verification.ports.ts";
import { FactcheckSession, type SessionListener, SessionNotFoundError, type SessionOptions } from "./session.entity.ts";
import type { SessionRepository } from "./session.repository.ts";

export type FactcheckConfig = Pick<Config, "context" | "verify" | "dedup" | "cache">;

export interface SessionServiceDeps {
  sessions: SessionRepository;
  transcription: Transcription;
  extractor: ClaimExtractor;
  embedder: ClaimEmbedder;
  verifier: Verifier;
  cache: VerdictCache;
  limiter: Limiter;
  metrics: Metrics;
  config: FactcheckConfig;
}

/**
 * The fact-checking pipeline, per session.
 * Hot lane: utterance → extraction → claim shown as `checking`.
 * Cold lane: dedup → cache → verification, in parallel, never holding up the next utterance.
 */
export class SessionService {
  private readonly deps: SessionServiceDeps;

  constructor(deps: SessionServiceDeps) {
    this.deps = deps;
  }

  start(options: SessionOptions): string {
    const session = new FactcheckSession(options);
    if (options.mode === "pcm-stream") {
      session.attachStream(
        this.deps.transcription.openStream(options.sampleRate, {
          onPartial: (text) => session.partial(text),
          onSpeechStopped: () => session.speechStopped(performance.now()),
          onCompleted: (text) => void this.ingest(session, text, session.takeSpeechStop()),
        }),
      );
    }
    this.deps.sessions.save(session);
    return session.id;
  }

  state(id: string) {
    return this.get(id).state();
  }

  subscribe(id: string, fn: SessionListener) {
    return this.get(id).subscribe(fn);
  }

  end(id: string) {
    this.get(id).end();
    this.deps.sessions.delete(id);
  }

  get count() {
    return this.deps.sessions.size;
  }

  /** A binary frame from the client: PCM16 (`pcm-stream`) or a complete audio file (`chunked`). */
  receiveAudio(id: string, data: Uint8Array) {
    const session = this.get(id);
    if (session.options.mode === "chunked") void this.transcribeChunk(session, data);
    else session.sendAudio(data);
  }

  /** Typed or injected text. Resolves once every claim in it has settled. */
  ingestText(id: string, text: string): Promise<void> {
    return this.ingest(this.get(id), text);
  }

  private get(id: string) {
    const session = this.deps.sessions.find(id);
    if (!session) throw new SessionNotFoundError(id);
    return session;
  }

  private async transcribeChunk(session: FactcheckSession, file: Uint8Array, ext = "m4a") {
    const t = performance.now();
    try {
      const text = (await this.deps.transcription.transcribeFile(file, ext)).trim();
      if (text) await this.ingest(session, text, t);
    } catch (e) {
      if (!session.ended) session.reportError(`transcription failed: ${errorMessage(e)}`);
    }
  }

  /** A finished utterance (VAD turn end, a chunk, or text). `tEnd` is when the speaker stopped. */
  private async ingest(session: FactcheckSession, text: string, tEnd?: number): Promise<void> {
    if (session.ended) return;
    const { extractor, metrics, config } = this.deps;
    const t0 = performance.now();
    if (tEnd !== undefined) metrics.observe("transcribe", t0 - tEnd);
    const start = tEnd ?? t0;

    const context = session.addUtterance(text, config.context.utterances);
    try {
      const found = await extractor.extract(text, context, session.signal);
      metrics.observe("extract", performance.now() - t0);
      await Promise.all(found.map((c) => this.check(session, c, start)));
    } catch (e) {
      if (!session.ended) session.reportError(`extraction failed: ${errorMessage(e)}`);
    }
  }

  private async check(session: FactcheckSession, found: ExtractedClaim, start: number) {
    const { embedder, cache, verifier, limiter, metrics, config } = this.deps;
    const claim = session.detectClaim(found);
    metrics.claims.detected++;
    const tDetected = performance.now();

    try {
      const emb = await embedder.embed(claim.claim, session.signal);
      if (!session.rememberIfNew(emb, config.dedup.threshold)) {
        session.dropClaim(claim.id);
        metrics.claims.duplicates++;
        return;
      }

      const hit = cache.lookup(emb, config.cache.threshold);
      if (hit) {
        metrics.claims.cacheHits++;
        this.finish(session, claim.id, hit, start, tDetected, true);
        return;
      }

      const prior = session.verifiedClaims(config.context.priorClaims);
      const result = await limiter.run(() =>
        verifier.verify(claim, prior, AbortSignal.any([session.signal, AbortSignal.timeout(config.verify.timeoutMs)])),
      );
      // CONTRADICTORY depends on this session only, so never share it.
      if (result.verdict !== "CONTRADICTORY") cache.store(claim.claim, emb, result);
      this.finish(session, claim.id, result, start, tDetected, false);
    } catch (e) {
      if (session.ended) return;
      metrics.claims.errors++;
      session.failClaim(claim.id, errorMessage(e));
    }
  }

  private finish(
    session: FactcheckSession,
    claimId: string,
    result: Verification,
    start: number,
    tDetected: number,
    cached: boolean,
  ) {
    const now = performance.now();
    this.deps.metrics.claims.verified++;
    this.deps.metrics.observe("verify", now - tDetected);
    this.deps.metrics.observe("total", now - start);
    session.resolveClaim(claimId, result, cached);
  }
}
