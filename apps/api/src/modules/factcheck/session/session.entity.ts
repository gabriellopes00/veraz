import { randomUUID } from "node:crypto";
import type { Claim, CreateSession, ServerEvent, Utterance, Verification } from "@veraz/shared";
import { InvalidInputError, NotFoundError } from "../../../shared/errors.ts";
import { cosine } from "../../../shared/vector.ts";
import type { TranscriptStream } from "../../transcription/index.ts";
import type { ExtractedClaim } from "../claim/claim.ports.ts";
import type { PriorClaim } from "../verification/verification.ports.ts";

export type SessionOptions = CreateSession;
export type SessionListener = (e: ServerEvent) => void;

export class SessionNotFoundError extends NotFoundError {
  constructor(id: string) {
    super(`session ${id} not found`);
  }
}

/**
 * One live conversation: its utterances and the claims found in them.
 * Aggregate root: claims change only through it, and every change is pushed to its subscribers.
 */
export class FactcheckSession {
  readonly id = randomUUID();
  readonly options: SessionOptions;
  /** Aborted when the session ends, which cancels every model call still in flight. */
  private readonly abort = new AbortController();
  private readonly claims = new Map<string, Claim>();
  /** One per claim still being checked: removing the claim cancels its embedding and verification. */
  private readonly checks = new Map<string, AbortController>();
  private readonly utterances: Utterance[] = [];
  private readonly embeddings: number[][] = [];
  private readonly speechStops: number[] = [];
  private readonly listeners = new Set<SessionListener>();
  private stream: TranscriptStream | null = null;

  constructor(options: SessionOptions) {
    this.options = options;
  }

  get signal() {
    return this.abort.signal;
  }

  get ended() {
    return this.abort.signal.aborted;
  }

  /** Sends a snapshot first, then every change. */
  subscribe(fn: SessionListener): () => void {
    this.listeners.add(fn);
    fn({ type: "snapshot", claims: [...this.claims.values()], utterances: this.utterances });
    return () => void this.listeners.delete(fn);
  }

  attachStream(stream: TranscriptStream) {
    this.stream = stream;
  }

  sendAudio(frame: Uint8Array) {
    this.stream?.send(frame);
  }

  partial(text: string) {
    this.emit({ type: "partial", text });
  }

  speechStopped(at: number) {
    this.speechStops.push(at);
  }

  /** When the speaker stopped, for the utterance that just completed (if the transcriber reported it). */
  takeSpeechStop(): number | undefined {
    return this.speechStops.shift();
  }

  /** Records a finished utterance. Returns up to `contextSize` earlier ones, to resolve references. */
  addUtterance(text: string, contextSize: number): string[] {
    const context = this.utterances.slice(-contextSize).map((u) => u.text);
    const utterance = { id: randomUUID(), text };
    this.utterances.push(utterance);
    this.emit({ type: "utterance", utterance });
    return context;
  }

  /** A new claim is shown right away as `checking`, before dedup and verification. */
  detectClaim(found: ExtractedClaim): Claim {
    const claim: Claim = {
      id: randomUUID(),
      ...found,
      status: "checking",
      result: null,
      error: null,
      cached: false,
      createdAt: Date.now(),
    };
    this.claims.set(claim.id, claim);
    this.checks.set(claim.id, new AbortController());
    this.emit({ type: "claim", claim: { ...claim } });
    return { ...claim };
  }

  /** Aborted when the claim is removed or the session ends. */
  claimSignal(id: string): AbortSignal {
    const check = this.checks.get(id);
    return check ? AbortSignal.any([this.signal, check.signal]) : AbortSignal.abort();
  }

  /**
   * Remembers a claim's embedding unless it repeats an earlier claim (false = duplicate).
   * Check and register happen in one synchronous step, so parallel twins cannot both pass.
   */
  rememberIfNew(embedding: number[], threshold: number): boolean {
    if (this.embeddings.some((e) => cosine(e, embedding) >= threshold)) return false;
    this.embeddings.push(embedding);
    return true;
  }

  /** Removes a claim (a duplicate, or deleted by the user) and cancels its check if it is still running. */
  dropClaim(id: string) {
    this.checks.get(id)?.abort();
    this.checks.delete(id);
    if (this.claims.delete(id)) this.emit({ type: "claim.removed", id });
  }

  /** The latest verified claims, oldest first. */
  verifiedClaims(limit: number): PriorClaim[] {
    return [...this.claims.values()]
      .filter((c) => c.status === "verified")
      .slice(-limit)
      .map((c) => ({ claim: c.claim, verdict: c.result?.verdict ?? null }));
  }

  claim(id: string): Claim | undefined {
    const claim = this.claims.get(id);
    return claim && { ...claim };
  }

  /** Puts a settled claim back to `checking` for a fresh verification. */
  recheckClaim(id: string): Claim {
    const claim = this.claims.get(id);
    if (!claim) throw new NotFoundError(`claim ${id} not found`);
    if (this.checks.has(id)) throw new InvalidInputError("claim is still being checked");
    this.checks.set(id, new AbortController());
    Object.assign(claim, { status: "checking", result: null, error: null, cached: false });
    this.emit({ type: "claim", claim: { ...claim } });
    return { ...claim };
  }

  resolveClaim(id: string, result: Verification, cached: boolean) {
    this.update(id, { status: "verified", result, cached });
  }

  failClaim(id: string, error: string) {
    this.update(id, { status: "error", error });
  }

  reportError(message: string) {
    this.emit({ type: "error", message });
  }

  state() {
    return { id: this.id, ...this.options, claims: [...this.claims.values()], utterances: this.utterances };
  }

  end() {
    this.abort.abort();
    this.stream?.close();
    this.listeners.clear();
  }

  private update(id: string, patch: Partial<Claim>) {
    const claim = this.claims.get(id);
    if (!claim) return;
    this.checks.delete(id); // settled
    Object.assign(claim, patch);
    this.emit({ type: "claim", claim: { ...claim } });
  }

  private emit(e: ServerEvent) {
    for (const fn of this.listeners) fn(e);
  }
}
