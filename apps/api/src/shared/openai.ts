// Helpers shared by the OpenAI adapters. Nothing outside an adapter should import this.
import { readFileSync } from "node:fs";
import type { ResponseUsage } from "openai/resources/responses/responses";
import type { TokenUsage } from "./metrics.ts";

/** Reads apps/api/prompts/<name>.md once. Static prefixes stay byte-identical so OpenAI prompt caching applies. */
export const loadPrompt = (name: string) => readFileSync(new URL(`../../prompts/${name}.md`, import.meta.url), "utf8");

export const tokenUsage = (u: ResponseUsage | undefined): TokenUsage => ({
  input: u?.input_tokens ?? 0,
  cached: u?.input_tokens_details?.cached_tokens ?? 0,
  output: u?.output_tokens ?? 0,
  reasoning: u?.output_tokens_details?.reasoning_tokens ?? 0,
});
