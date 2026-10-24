import type { Verification } from "@veraz/shared";

/** Comparable form of a URL: no protocol, www, query, fragment or trailing slash. */
export const normUrl = (u: string) =>
  u
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "")
    .replace(/^https?:\/\/(www\.)?/, "")
    .toLowerCase();

/**
 * Sources must come from an actual search result: everything else is dropped.
 * A verdict left with no source becomes UNVERIFIABLE (unless it never needed one).
 */
export function keepGroundedSources(v: Verification, grounded: Set<string>): Verification {
  const sources = v.sources.filter((s) => grounded.has(normUrl(s.url)));
  if (
    sources.length === 0 &&
    v.verdict !== "NO_EVIDENCE" &&
    v.verdict !== "UNVERIFIABLE" &&
    v.verdict !== "CONTRADICTORY"
  ) {
    return {
      ...v,
      verdict: "UNVERIFIABLE",
      confidence: Math.min(v.confidence, 0.3),
      sources,
      summary: `${v.summary} (No verifiable source was found.)`,
    };
  }
  return { ...v, sources };
}
