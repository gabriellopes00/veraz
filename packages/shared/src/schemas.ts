import { z } from "zod";
import { verdictSchema } from "./verdicts.ts";

export const CATEGORIES = [
  "politics",
  "health",
  "science",
  "economy",
  "sports",
  "history",
  "technology",
  "general",
] as const;
export const categorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof categorySchema>;

// ---- Model outputs (OpenAI Structured Outputs: no optionals, use nullable) ----

export const extractionSchema = z.object({
  claims: z.array(
    z.object({
      quote: z.string().describe("Exact words from the utterance"),
      claim: z.string().describe("Self-contained claim, pronouns and context resolved"),
      category: categorySchema,
      language: z.string().describe("ISO 639-1 code of the claim, e.g. pt or en"),
    }),
  ),
});
export type Extraction = z.infer<typeof extractionSchema>;

export const sourceSchema = z.object({
  title: z.string(),
  outlet: z.string(),
  url: z.string(),
  published_at: z.string().nullable().describe("ISO date if known"),
  stance: z.enum(["supports", "refutes", "context"]),
});
export type Source = z.infer<typeof sourceSchema>;

export const verificationSchema = z.object({
  verdict: verdictSchema,
  confidence: z.number().describe("0 to 1"),
  summary: z.string().describe("1-2 sentences"),
  explanation: z.string(),
  sources: z.array(sourceSchema),
});
export type Verification = z.infer<typeof verificationSchema>;

// ---- Client-facing state ----

export const claimStatusSchema = z.enum(["detected", "checking", "verified", "error"]);
export type ClaimStatus = z.infer<typeof claimStatusSchema>;

export const claimSchema = z.object({
  id: z.string(),
  quote: z.string(),
  claim: z.string(),
  category: categorySchema,
  language: z.string(),
  status: claimStatusSchema,
  result: verificationSchema.nullable(),
  error: z.string().nullable(),
  cached: z.boolean(),
  createdAt: z.number(),
});
export type Claim = z.infer<typeof claimSchema>;

/** A verified claim saved by the user: a snapshot that outlives the session it came from. */
export const favoriteSchema = claimSchema.extend({
  status: z.literal("verified"),
  result: verificationSchema,
  savedAt: z.number(),
});
export type Favorite = z.infer<typeof favoriteSchema>;

/** The server copies the claim from its session, so a favourite only holds what was really verified. */
export const saveFavoriteSchema = z.object({ sessionId: z.string().min(1), claimId: z.string().min(1) });
export type SaveFavorite = z.infer<typeof saveFavoriteSchema>;

/** With `sessionId`, a favourite still listed in that live session is rechecked there, so its card updates too. */
export const recheckFavoriteSchema = z.object({ sessionId: z.string().min(1).optional() });
export type RecheckFavorite = z.infer<typeof recheckFavoriteSchema>;

export const utteranceSchema = z.object({ id: z.string(), text: z.string() });
export type Utterance = z.infer<typeof utteranceSchema>;

// ---- WebSocket events (server -> client). Audio goes client -> server as binary frames. ----

export const serverEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("snapshot"), claims: z.array(claimSchema), utterances: z.array(utteranceSchema) }),
  z.object({ type: z.literal("partial"), text: z.string() }),
  z.object({ type: z.literal("utterance"), utterance: utteranceSchema }),
  z.object({ type: z.literal("claim"), claim: claimSchema }),
  z.object({ type: z.literal("claim.removed"), id: z.string() }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);
export type ServerEvent = z.infer<typeof serverEventSchema>;

export const clientMessageSchema = z.object({ type: z.literal("text"), text: z.string().min(1) });
export type ClientMessage = z.infer<typeof clientMessageSchema>;

export const AUDIO_MODES = ["pcm-stream", "chunked"] as const;
export const createSessionSchema = z.object({
  mode: z.enum(AUDIO_MODES).default("pcm-stream"),
  /** Sample rate of the PCM16 frames the client will send (resampled to 24 kHz server-side). */
  sampleRate: z.number().int().min(8000).max(48000).default(24000),
});
export type CreateSession = z.infer<typeof createSessionSchema>;
