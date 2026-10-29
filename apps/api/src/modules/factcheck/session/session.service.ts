import type { Claim, Verification } from "@veraz/shared";
import type { Config } from "../../../config.ts";
import { errorMessage, NotFoundError } from "../../../shared/errors.ts";
import type { Limiter } from "../../../shared/limiter.ts";
import type { Metrics } from "../../../shared/metrics.ts";
import type { Transcription } from "../../transcription/index.ts";
import type { ClaimEmbedder, ClaimExtractor, ExtractedClaim } from "../claim/claim.ports.ts";
import type { ClaimToVerify, PriorClaim, VerdictCache, Verifier } from "../verification/verification.ports.ts";
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

  /** A copy of one claim, for other modules (favourites). */
  claim(sessionId: string, claimId: string): Claim {
    const claim = this.get(sessionId).claim(claimId);
    if (!claim) throw new NotFoundError(`claim ${claimId} not found`);
    return claim;
  }

  /** Deleted by the user: it leaves the session and its check, if still running, is cancelled. */
  removeClaim(sessionId: string, claimId: string) {
    this.get(sessionId).dropClaim(claimId);
  }

  /**
   * Checks a settled claim again, skipping dedup and the cache: the user asked for a fresh look. Throws at once if the
   * claim is unknown or still being checked. Resolves with the settled claim, or undefined if it was removed meanwhile.
   */
  recheck(sessionId: string, claimId: string): Promise<Claim | undefined> {
    const session = this.get(sessionId);
    return this.reverify(session, session.recheckClaim(claimId));
  }

  /** A fresh verdict for a claim whose session may be gone (a favourite), skipping the cache. */
  verify(claim: ClaimToVerify): Promise<Verification> {
    return this.fresh(claim, [], AbortSignal.timeout(this.deps.config.verify.timeoutMs));
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
    const { embedder, cache, metrics, config } = this.deps;
    const claim = session.detectClaim(found);
    metrics.claims.detected++;
    const tDetected = performance.now();
    const signal = session.claimSignal(claim.id);

    try {
      const emb = await embedder.embed(claim.claim, signal);
      signal.throwIfAborted();
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

      const result = await this.verifyLimited(claim, session.verifiedClaims(config.context.priorClaims), signal);
      signal.throwIfAborted();
      // CONTRADICTORY depends on this session only, so never share it.
      if (result.verdict !== "CONTRADICTORY") cache.store(claim.claim, emb, result);
      this.finish(session, claim.id, result, start, tDetected, false);
    } catch (e) {
      if (signal.aborted) return; // removed or session ended: nobody is waiting for a verdict
      metrics.claims.errors++;
      session.failClaim(claim.id, errorMessage(e));
    }
  }

  private async reverify(session: FactcheckSession, claim: Claim): Promise<Claim | undefined> {
    const { metrics, config } = this.deps;
    const t0 = performance.now();
    const signal = session.claimSignal(claim.id);
    try {
      const result = await this.fresh(claim, session.verifiedClaims(config.context.priorClaims), signal);
      signal.throwIfAborted();
      metrics.observe("verify", performance.now() - t0);
      session.resolveClaim(claim.id, result, false);
    } catch (e) {
      if (!signal.aborted) {
        metrics.claims.errors++;
        session.failClaim(claim.id, errorMessage(e));
      }
    }
    return session.claim(claim.id);
  }

  /** Verifies without looking at the cache, then stores the new verdict there so later matches get it. */
  private async fresh(claim: ClaimToVerify, prior: PriorClaim[], signal: AbortSignal): Promise<Verification> {
    // The embedding only feeds the cache, so it runs alongside and its failure costs nothing but the store.
    const [emb, result] = await Promise.all([
      this.deps.embedder.embed(claim.claim, signal).catch(() => null),
      this.verifyLimited(claim, prior, signal),
    ]);
    if (emb && result.verdict !== "CONTRADICTORY") this.deps.cache.store(claim.claim, emb, result);
    return result;
  }

  private verifyLimited(claim: ClaimToVerify, prior: PriorClaim[], signal: AbortSignal): Promise<Verification> {
    const { limiter, verifier, config } = this.deps;
    return limiter.run(() => {
      signal.throwIfAborted(); // removed while waiting for a slot
      return verifier.verify(claim, prior, AbortSignal.any([signal, AbortSignal.timeout(config.verify.timeoutMs)]));
    });
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
