import { VERDICTS, type Category, type Verification } from "@veraz/shared";
import type { AI, TranscriberHandlers } from "./ai";
import { SAMPLE_PT } from "./sample";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

const CHECKABLE = /\d|ganhou|perdeu|cinco|causa|sempre|nunca|primeiro|maior|menor|always|never|first|largest/i;
const CATEGORY_HINTS: [RegExp, Category][] = [
  [/vacina|sa[uú]de|doen[cç]a|vaccine|health/i, "health"],
  [/infla[cç][aã]o|pib|economia|inflation/i, "economy"],
  [/copa|futebol|jogo|world cup/i, "sports"],
  [/governo|presidente|elei[cç]|government/i, "politics"],
  [/amaz[oô]nia|clima|ci[eê]ncia|science/i, "science"],
];

/** Deterministic fake AI: same pipeline, no network, no keys. */
export function createMockAI(): AI {
  return {
    async extract(utterance) {
      await sleep(40);
      if (utterance.trim().endsWith("?") || !CHECKABLE.test(utterance)) return [];
      return [
        {
          quote: utterance,
          claim: utterance,
          category: CATEGORY_HINTS.find(([re]) => re.test(utterance))?.[1] ?? "general",
          language: /[ãõçé]|\b(o|a|de|que|não)\b/i.test(utterance) ? "pt" : "en",
        },
      ];
    },

    /** Bag-of-words hashing: similar sentences get similar vectors. */
    async embed(text) {
      const v = new Array(128).fill(0);
      for (const w of text.toLowerCase().match(/\p{L}+|\d+/gu) ?? []) v[hash(w) % 128] += 1;
      return v;
    },

    async verify(c, prior, signal) {
      await sleep(300);
      signal.throwIfAborted();
      const pool = VERDICTS.filter((v) => v !== "CONTRADICTORY");
      const verdict = prior.some((p) => p.claim !== c.claim && /menos de 100 milh/.test(c.claim) && /200 milh/.test(p.claim))
        ? "CONTRADICTORY"
        : pool[hash(c.claim) % pool.length]!;
      const result: Verification = {
        verdict,
        confidence: 0.5 + (hash(c.claim) % 50) / 100,
        summary: `[mock] Simulated verdict for: ${c.claim}`,
        explanation: "[mock] This result was generated without calling any model.",
        sources: ["Agência Lupa", "G1", "IBGE"].map((outlet, i) => ({
          title: `[mock] ${outlet} on this claim`,
          outlet,
          url: `https://example.com/${outlet.toLowerCase().replace(/\W/g, "")}/${hash(c.claim)}`,
          published_at: "2024-01-0" + (i + 1),
          stance: (["supports", "context", "refutes"] as const)[i]!,
        })),
      };
      return result;
    },

    async transcribeChunk() {
      await sleep(50);
      return SAMPLE_PT[1]!;
    },

    /** Emits the next sample sentence for every ~2 s of audio received. */
    openTranscriber(h: TranscriberHandlers) {
      let bytes = 0;
      let i = 0;
      const BYTES_PER_UTTERANCE = 24000 * 2 * 2;
      return {
        send(pcm) {
          bytes += pcm.byteLength;
          if (bytes < BYTES_PER_UTTERANCE) return;
          bytes = 0;
          const text = SAMPLE_PT[i++ % SAMPLE_PT.length]!;
          h.onPartial(text.slice(0, Math.ceil(text.length / 2)));
          h.onSpeechStopped();
          setTimeout(() => h.onCompleted(text), 100);
        },
        close() {},
      };
    },
  };
}
