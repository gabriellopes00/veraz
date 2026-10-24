import { setTimeout as sleep } from "node:timers/promises";
import type { Category } from "@veraz/shared";
import type { ClaimEmbedder, ClaimExtractor, ExtractedClaim } from "./claim.ports.ts";

export const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

const CHECKABLE = /\d|ganhou|perdeu|cinco|causa|sempre|nunca|primeiro|maior|menor|always|never|first|largest/i;
const CATEGORY_HINTS: [RegExp, Category][] = [
  [/vacina|sa[uú]de|doen[cç]a|vaccine|health/i, "health"],
  [/infla[cç][aã]o|pib|economia|inflation/i, "economy"],
  [/copa|futebol|jogo|world cup/i, "sports"],
  [/governo|presidente|elei[cç]|government/i, "politics"],
  [/amaz[oô]nia|clima|ci[eê]ncia|science/i, "science"],
];

/** Deterministic fake extractor: one claim per utterance that looks checkable. */
export class MockClaimExtractor implements ClaimExtractor {
  async extract(utterance: string, _context: string[], signal: AbortSignal): Promise<ExtractedClaim[]> {
    await sleep(40, undefined, { signal });
    if (utterance.trim().endsWith("?") || !CHECKABLE.test(utterance)) return [];
    return [
      {
        quote: utterance,
        claim: utterance,
        category: CATEGORY_HINTS.find(([re]) => re.test(utterance))?.[1] ?? "general",
        language: /[ãõçé]|\b(o|a|de|que|não)\b/i.test(utterance) ? "pt" : "en",
      },
    ];
  }
}

/** Bag-of-words hashing: similar sentences get similar vectors. */
export class MockClaimEmbedder implements ClaimEmbedder {
  async embed(text: string) {
    const v = new Array<number>(128).fill(0);
    for (const w of text.toLowerCase().match(/\p{L}+|\d+/gu) ?? []) v[hash(w) % 128]! += 1;
    return v;
  }
}
