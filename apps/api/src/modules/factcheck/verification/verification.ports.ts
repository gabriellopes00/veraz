import type { Category, Verdict, Verification } from "@veraz/shared";

export interface ClaimToVerify {
  claim: string;
  category: Category;
  language: string;
}

/** An earlier claim from the same session, so the verifier can flag CONTRADICTORY. */
export interface PriorClaim {
  claim: string;
  verdict: Verdict | null;
}

export interface Verifier {
  verify(c: ClaimToVerify, prior: PriorClaim[], signal: AbortSignal): Promise<Verification>;
}

/** Verdicts shared across sessions, matched by embedding similarity. */
export interface VerdictCache {
  lookup(embedding: ArrayLike<number>, threshold: number): Verification | null;
  store(claim: string, embedding: number[], result: Verification): void;
}
