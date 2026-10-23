import type { Claim, ServerEvent, Utterance } from "@veraz/shared";
import type { AI, Transcriber } from "./ai";
import type { VerdictCache } from "./cache";
import { cosine, resamplePcm16 } from "./audio";
import { config } from "./config";
import { metrics } from "./metrics";

/** Counting semaphore: caps parallel verifications. */
export class Limiter {
  private active = 0;
  private waiting: (() => void)[] = [];
  constructor(private max: number) {}
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) await new Promise<void>((r) => this.waiting.push(r));
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.waiting.shift()?.();
    }
  }
}

export interface SessionDeps {
  ai: AI;
  cache: VerdictCache;
  limiter: Limiter;
}

export interface SessionOptions {
  mode: "pcm-stream" | "chunked";
  sampleRate: number;
}

type Listener = (e: ServerEvent) => void;

export class Session {
  readonly id = crypto.randomUUID();
  readonly claims = new Map<string, Claim>();
  readonly utterances: Utterance[] = [];
  private listeners = new Set<Listener>();
  private embeddings: number[][] = [];
  private speechStops: number[] = [];
  private transcriber?: Transcriber;

  constructor(readonly opts: SessionOptions, private deps: SessionDeps) {
    // Open the upstream connection now so it is warm before the first word.
    if (opts.mode === "pcm-stream") {
      this.transcriber = deps.ai.openTranscriber({
        onPartial: (text) => this.emit({ type: "partial", text }),
        onSpeechStopped: () => this.speechStops.push(performance.now()),
        onCompleted: (text) => void this.ingest(text, this.speechStops.shift()),
      });
    }
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn({ type: "snapshot", claims: [...this.claims.values()], utterances: this.utterances });
    return () => this.listeners.delete(fn);
  }

  private emit(e: ServerEvent) {
    for (const fn of this.listeners) fn(e);
  }

  /** Binary PCM16 mono frame from the client. */
  audio(frame: Uint8Array) {
    this.transcriber?.send(resamplePcm16(frame, this.opts.sampleRate, 24000));
  }

  /** A complete audio file (chunked mode). */
  async chunk(file: Uint8Array, ext = "m4a") {
    const t = performance.now();
    try {
      const text = (await this.deps.ai.transcribeChunk(file, ext)).trim();
      if (text) await this.ingest(text, t);
    } catch (e) {
      this.emit({ type: "error", message: `transcription failed: ${String(e)}` });
    }
  }

  /**
   * A finished utterance (VAD turn end, a chunk, or injected text).
   * Resolves once every claim in it has settled.
   */
  async ingest(text: string, tEnd?: number): Promise<void> {
    const t0 = performance.now();
    if (tEnd !== undefined) metrics.observe("transcribe", t0 - tEnd);
    const start = tEnd ?? t0;

    const context = this.utterances.slice(-config.context.utterances).map((u) => u.text);
    const utterance = { id: crypto.randomUUID(), text };
    this.utterances.push(utterance);
    this.emit({ type: "utterance", utterance });

    try {
      const found = await this.deps.ai.extract(text, context);
      metrics.observe("extract", performance.now() - t0);
      await Promise.all(found.map((c) => this.check(c, start)));
    } catch (e) {
      this.emit({ type: "error", message: `extraction failed: ${String(e)}` });
    }
  }

  private update(claim: Claim, patch: Partial<Claim>) {
    Object.assign(claim, patch);
    this.emit({ type: "claim", claim: { ...claim } });
  }

  private async check(raw: { quote: string; claim: string; category: Claim["category"]; language: string }, start: number) {
    const claim: Claim = {
      id: crypto.randomUUID(),
      ...raw,
      status: "checking",
      result: null,
      error: null,
      cached: false,
      createdAt: Date.now(),
    };
    this.claims.set(claim.id, claim);
    this.emit({ type: "claim", claim: { ...claim } }); // shown immediately, before dedup/verification
    metrics.claims.detected++;
    const tDetected = performance.now();

    try {
      const emb = await this.deps.ai.embed(claim.claim);

      // Check + register is synchronous after the await, so parallel twins cannot both pass.
      if (this.embeddings.some((e) => cosine(e, emb) >= config.dedup.threshold)) {
        this.claims.delete(claim.id);
        this.emit({ type: "claim.removed", id: claim.id });
        metrics.claims.duplicates++;
        return;
      }
      this.embeddings.push(emb);

      const hit = this.deps.cache.lookup(emb, config.cache.threshold);
      if (hit) {
        metrics.claims.cacheHits++;
        this.finish(claim, hit, start, tDetected, true);
        return;
      }

      const prior = [...this.claims.values()]
        .filter((c) => c.id !== claim.id && c.status === "verified")
        .slice(-config.context.priorClaims)
        .map((c) => ({ claim: c.claim, verdict: c.result?.verdict ?? null }));

      const result = await this.deps.limiter.run(() =>
        this.deps.ai.verify(claim, prior, AbortSignal.timeout(config.verify.timeoutMs)),
      );
      // CONTRADICTORY depends on this session only, so never share it.
      if (result.verdict !== "CONTRADICTORY") this.deps.cache.store(claim.claim, emb, result);
      this.finish(claim, result, start, tDetected, false);
    } catch (e) {
      metrics.claims.errors++;
      this.update(claim, { status: "error", error: e instanceof Error ? e.message : String(e) });
    }
  }

  private finish(claim: Claim, result: Claim["result"], start: number, tDetected: number, cached: boolean) {
    const now = performance.now();
    metrics.claims.verified++;
    metrics.observe("verify", now - tDetected);
    metrics.observe("total", now - start);
    this.update(claim, { status: "verified", result, cached });
  }

  state() {
    return { id: this.id, ...this.opts, claims: [...this.claims.values()], utterances: this.utterances };
  }

  close() {
    this.transcriber?.close();
    this.listeners.clear();
  }
}
