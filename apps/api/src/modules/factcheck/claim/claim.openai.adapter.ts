import { extractionSchema } from "@veraz/shared";
import type { OpenAI } from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { ReasoningEffort } from "openai/resources/shared";
import type { Config } from "../../../config.ts";
import type { Metrics } from "../../../shared/metrics.ts";
import { loadPrompt, tokenUsage } from "../../../shared/openai.ts";
import type { ClaimEmbedder, ClaimExtractor, ExtractedClaim } from "./claim.ports.ts";

const FORMAT = zodTextFormat(extractionSchema, "claims");

export class OpenAIClaimExtractor implements ClaimExtractor {
  private readonly prompt = loadPrompt("extract");
  private readonly client: OpenAI;
  private readonly opts: Pick<Config, "models" | "extractEffort">;
  private readonly metrics: Metrics;

  constructor(client: OpenAI, opts: Pick<Config, "models" | "extractEffort">, metrics: Metrics) {
    this.client = client;
    this.opts = opts;
    this.metrics = metrics;
  }

  async extract(utterance: string, context: string[], signal: AbortSignal): Promise<ExtractedClaim[]> {
    const earlier = context.map((c) => `- ${c}`).join("\n") || "(none)";
    const res = await this.client.responses.parse(
      {
        model: this.opts.models.extract,
        reasoning: { effort: this.opts.extractEffort as ReasoningEffort },
        store: false,
        prompt_cache_key: "veraz-extract",
        input: [
          { role: "system", content: this.prompt },
          { role: "user", content: `Earlier utterances:\n${earlier}\n\nLatest utterance:\n${utterance}` },
        ],
        text: { format: FORMAT },
      },
      { signal },
    );
    this.metrics.addTokens("extract", tokenUsage(res.usage));
    return res.output_parsed?.claims ?? [];
  }
}

export class OpenAIClaimEmbedder implements ClaimEmbedder {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly metrics: Metrics;

  constructor(client: OpenAI, model: string, metrics: Metrics) {
    this.client = client;
    this.model = model;
    this.metrics = metrics;
  }

  async embed(text: string, signal: AbortSignal) {
    const res = await this.client.embeddings.create({ model: this.model, input: text }, { signal });
    this.metrics.addTokens("embed", { input: res.usage?.prompt_tokens });
    return res.data[0]!.embedding;
  }
}
