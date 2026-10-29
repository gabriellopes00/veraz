import type { Claim, Favorite } from "@veraz/shared";
import { InvalidInputError } from "../../shared/errors.ts";

/** Only verified claims can be saved: a favourite is a checked fact to come back to. */
export function toFavorite(claim: Claim, savedAt: number): Favorite {
  if (claim.status !== "verified" || !claim.result) throw new InvalidInputError("only verified claims can be saved");
  return { ...claim, status: "verified", result: claim.result, savedAt };
}
