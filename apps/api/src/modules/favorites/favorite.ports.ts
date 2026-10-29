import type { Claim, Favorite, Verification } from "@veraz/shared";

/** Saved claims, kept across sessions and restarts. */
export interface FavoriteRepository {
  /** Newest first. */
  list(): Favorite[];
  find(id: string): Favorite | undefined;
  save(favorite: Favorite): void;
  delete(id: string): void;
}

/** Where claims are read from and checked again: the live session they were checked in, or none once it is gone. */
export interface ClaimSource {
  /** Throws NotFoundError if the session or the claim is gone. */
  claim(sessionId: string, claimId: string): Claim;
  /** Checks the claim again in its live session. Throws NotFoundError if it is gone; undefined if removed meanwhile. */
  recheck(sessionId: string, claimId: string): Promise<Claim | undefined>;
  /** A fresh verdict for a claim outside any session. */
  verify(claim: Claim): Promise<Verification>;
}
