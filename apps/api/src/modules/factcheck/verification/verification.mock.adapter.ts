import { setTimeout as sleep } from "node:timers/promises";
import { VERDICTS, type Verification } from "@veraz/shared";
import { hash } from "../claim/claim.mock.adapter.ts";
import type { ClaimToVerify, PriorClaim, Verifier } from "./verification.ports.ts";

/** Deterministic fake verdicts with three fake sources. */
export class MockVerifier implements Verifier {
  async verify(c: ClaimToVerify, prior: PriorClaim[], signal: AbortSignal): Promise<Verification> {
    await sleep(300, undefined, { signal });
    const pool = VERDICTS.filter((v) => v !== "CONTRADICTORY");
    const contradicts = prior.some(
      (p) => p.claim !== c.claim && /menos de 100 milh/.test(c.claim) && /200 milh/.test(p.claim),
    );
    return {
      verdict: contradicts ? "CONTRADICTORY" : pool[hash(c.claim) % pool.length]!,
      confidence: 0.5 + (hash(c.claim) % 50) / 100,
      summary: `[mock] Simulated verdict for: ${c.claim}`,
      explanation: "[mock] This result was generated without calling any model.",
      sources: ["Agência Lupa", "G1", "IBGE"].map((outlet, i) => ({
        title: `[mock] ${outlet} on this claim`,
        outlet,
        url: `https://example.com/${outlet.toLowerCase().replace(/\W/g, "")}/${hash(c.claim)}`,
        published_at: `2024-01-0${i + 1}`,
        stance: (["supports", "context", "refutes"] as const)[i]!,
      })),
    };
  }
}
