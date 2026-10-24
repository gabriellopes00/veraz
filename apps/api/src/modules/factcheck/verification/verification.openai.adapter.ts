import { VERDICT_PROMPT_TEXT, type Verification, verificationSchema } from "@veraz/shared";
import type { OpenAI } from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { ResponseOutputItem } from "openai/resources/responses/responses";
import type { ReasoningEffort } from "openai/resources/shared";
import type { Config } from "../../../config.ts";
import type { Metrics } from "../../../shared/metrics.ts";
import { loadPrompt, tokenUsage } from "../../../shared/openai.ts";
import { keepGroundedSources, normUrl } from "./verification.grounding.ts";
import type { ClaimToVerify, PriorClaim, Verifier } from "./verification.ports.ts";
import { domainsFor } from "./verification.sources.ts";

const FORMAT = zodTextFormat(verificationSchema, "verification");

type Options = Pick<Config, "models" | "verifyEffort" | "verify">;

/** Responses API + web_search, restricted to the trusted domains of the claim's category. */
export class OpenAIVerifier implements Verifier {
  private readonly prompt = loadPrompt("verify").replace("{{VERDICTS}}", VERDICT_PROMPT_TEXT);
  private readonly client: OpenAI;
  private readonly opts: Options;
  private readonly metrics: Metrics;

  constructor(client: OpenAI, opts: Options, metrics: Metrics) {
    this.client = client;
    this.opts = opts;
    this.metrics = metrics;
  }

  async verify(c: ClaimToVerify, prior: PriorClaim[], signal: AbortSignal): Promise<Verification> {
    const priorText = prior.map((p) => `- ${p.claim}${p.verdict ? ` [${p.verdict}]` : ""}`).join("\n") || "(none)";
    const res = await this.client.responses.parse(
      {
        model: this.opts.models.verify,
        reasoning: { effort: this.opts.verifyEffort as ReasoningEffort },
        store: false,
        prompt_cache_key: "veraz-verify",
        tools: [
          {
            type: "web_search",
            filters: { allowed_domains: domainsFor(c.category, this.opts.verify.maxDomains) },
          },
        ],
        tool_choice: "required",
        include: ["web_search_call.action.sources"],
        input: [
          { role: "system", content: this.prompt },
          {
            role: "user",
            content: `Today: ${new Date().toISOString().slice(0, 10)}\nLanguage: ${c.language}\nEarlier claims in this conversation:\n${priorText}\n\nClaim to verify:\n${c.claim}`,
          },
        ],
        text: { format: FORMAT },
      },
      { signal },
    );
    this.metrics.addTokens("verify", tokenUsage(res.usage));
    if (!res.output_parsed) throw new Error("verification returned no parsed output");
    return keepGroundedSources(res.output_parsed, groundedUrls(res.output));
  }
}

/** Every URL the web_search tool actually returned or cited. */
function groundedUrls(output: ResponseOutputItem[]): Set<string> {
  const urls = new Set<string>();
  for (const item of output) {
    if (item.type === "web_search_call" && item.action.type === "search")
      for (const s of item.action.sources ?? []) urls.add(normUrl(s.url));
    if (item.type === "message")
      for (const c of item.content)
        if (c.type === "output_text")
          for (const a of c.annotations) if (a.type === "url_citation") urls.add(normUrl(a.url));
  }
  return urls;
}
