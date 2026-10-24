import { z } from "zod";

export const VERDICTS = [
  "TRUE",
  "TRUE_BUT",
  "NOT_QUITE",
  "EXAGGERATED",
  "UNDERSTATED",
  "DISTORTED",
  "MISLEADING",
  "FALSE",
  "NO_EVIDENCE",
  "CONTRADICTORY",
  "OUTDATED",
  "UNVERIFIABLE",
] as const;

export const verdictSchema = z.enum(VERDICTS);
export type Verdict = z.infer<typeof verdictSchema>;

export interface VerdictInfo {
  pt: string;
  en: string;
  color: string;
  /** Precise definition. Also injected into the prompts. */
  definition: string;
}

export const VERDICT_INFO: Record<Verdict, VerdictInfo> = {
  TRUE: {
    pt: "Verdadeiro",
    en: "True",
    color: "#16a34a",
    definition: "Accurate and supported by reliable sources, with no material omission.",
  },
  TRUE_BUT: {
    pt: "Verdadeiro, mas…",
    en: "True, but…",
    color: "#65a30d",
    definition: "Literally accurate, but needs an important caveat or context that changes how it should be read.",
  },
  NOT_QUITE: {
    pt: "Não é bem assim",
    en: "Not quite",
    color: "#ca8a04",
    definition: "Partly right, but a detail (who, when, where, how) is wrong or imprecise.",
  },
  EXAGGERATED: {
    pt: "Exagerado",
    en: "Exaggerated",
    color: "#ea580c",
    definition: "Points in the right direction, but the magnitude, frequency or intensity is inflated.",
  },
  UNDERSTATED: {
    pt: "Subestimado",
    en: "Understated",
    color: "#0891b2",
    definition: "Points in the right direction, but the real magnitude, frequency or intensity is larger than stated.",
  },
  DISTORTED: {
    pt: "Distorcido",
    en: "Distorted",
    color: "#c2410c",
    definition:
      "Real data or facts presented in a twisted way: wrong comparison, cherry-picked period, mixed-up cause and effect.",
  },
  MISLEADING: {
    pt: "Enganoso",
    en: "Misleading",
    color: "#d97706",
    definition:
      "Each piece may be accurate, but the whole leads to a false conclusion because of omitted or manipulated context.",
  },
  FALSE: {
    pt: "Falso",
    en: "False",
    color: "#dc2626",
    definition: "Contradicted by reliable sources or by established fact.",
  },
  NO_EVIDENCE: {
    pt: "Sem provas",
    en: "No evidence",
    color: "#7c3aed",
    definition: "A checkable claim, but searches found no reliable source supporting it or refuting it.",
  },
  CONTRADICTORY: {
    pt: "Contraditório",
    en: "Contradictory",
    color: "#be185d",
    definition: "Contradicts something the same speaker or conversation said earlier in this session.",
  },
  OUTDATED: {
    pt: "Desatualizado",
    en: "Outdated",
    color: "#64748b",
    definition: "Was true at some point, but newer data or events have changed it.",
  },
  UNVERIFIABLE: {
    pt: "Não verificável",
    en: "Unverifiable",
    color: "#6b7280",
    definition: "Cannot be checked against public sources (private, subjective, or too vague to test).",
  },
};

/** Text block used inside prompts. Deterministic, so the prompt prefix stays byte-identical. */
export const VERDICT_PROMPT_TEXT = VERDICTS.map((v) => `- ${v}: ${VERDICT_INFO[v].definition}`).join("\n");
