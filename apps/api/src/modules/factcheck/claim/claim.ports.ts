import type { Extraction } from "@veraz/shared";

/** A claim as found in an utterance, before it gets an id or a verdict. */
export type ExtractedClaim = Extraction["claims"][number];

export interface ClaimExtractor {
  /** Check-worthy claims in `utterance`. `context` holds earlier utterances, used only to resolve references. */
  extract(utterance: string, context: string[], signal: AbortSignal): Promise<ExtractedClaim[]>;
}

/** Turns a claim into a vector; similar claims get close vectors (dedup and cache lookups). */
export interface ClaimEmbedder {
  embed(text: string, signal: AbortSignal): Promise<number[]>;
}
