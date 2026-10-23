import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  VERDICT_PROMPT_TEXT,
  extractionSchema,
  verificationSchema,
  type Category,
  type Extraction,
  type Verification,
} from "@veraz/shared";
import { config } from "./config";
import { metrics } from "./metrics";
import { domainsFor } from "./sources";
import { createMockAI } from "./mock";

export interface PriorClaim {
  claim: string;
  verdict: string | null;
}

export interface TranscriberHandlers {
  onPartial(text: string): void;
  onSpeechStopped(): void;
  onCompleted(text: string): void;
}

export interface Transcriber {
  /** PCM16 mono little-endian at 24 kHz. */
  send(pcm24k: Uint8Array): void;
  close(): void;
}

export interface AI {
  extract(utterance: string, context: string[]): Promise<Extraction["claims"]>;
  embed(text: string): Promise<number[]>;
  verify(c: { claim: string; category: Category; language: string }, prior: PriorClaim[], signal: AbortSignal): Promise<Verification>;
  transcribeChunk(audio: Uint8Array, ext: string): Promise<string>;
  openTranscriber(h: TranscriberHandlers): Transcriber;
}

// Static prefixes: built once, byte-identical on every call so OpenAI prompt caching applies.
const EXTRACT_PROMPT = await Bun.file(new URL("../prompts/extract.md", import.meta.url)).text();
const VERIFY_PROMPT = (await Bun.file(new URL("../prompts/verify.md", import.meta.url)).text()).replace(
  "{{VERDICTS}}",
  VERDICT_PROMPT_TEXT,
);

/** Collect every URL the web_search tool actually returned or cited. */
function groundedUrls(output: any[]): Set<string> {
  const urls = new Set<string>();
  for (const item of output) {
    if (item.type === "web_search_call") for (const s of item.action?.sources ?? []) if (s.url) urls.add(normUrl(s.url));
    if (item.type === "message")
      for (const c of item.content ?? [])
        for (const a of c.annotations ?? []) if (a.type === "url_citation" && a.url) urls.add(normUrl(a.url));
  }
  return urls;
}

const normUrl = (u: string) => u.replace(/[?#].*$/, "").replace(/\/+$/, "").replace(/^https?:\/\/(www\.)?/, "").toLowerCase();

export function keepGroundedSources(v: Verification, grounded: Set<string>): Verification {
  const sources = v.sources.filter((s) => grounded.has(normUrl(s.url)));
  if (sources.length === 0 && v.verdict !== "NO_EVIDENCE" && v.verdict !== "UNVERIFIABLE" && v.verdict !== "CONTRADICTORY") {
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

function createRealAI(): AI {
  if (!config.openaiKey) throw new Error("OPENAI_API_KEY is missing (or set MOCK_OPENAI=true)");
  const client = new OpenAI({ apiKey: config.openaiKey, maxRetries: 1 });

  return {
    async extract(utterance, context) {
      const res = await client.responses.parse({
        model: config.models.extract,
        reasoning: { effort: config.extractEffort as any },
        store: false,
        prompt_cache_key: "veraz-extract",
        input: [
          { role: "system", content: EXTRACT_PROMPT },
          {
            role: "user",
            content: `Earlier utterances:\n${context.map((c) => `- ${c}`).join("\n") || "(none)"}\n\nLatest utterance:\n${utterance}`,
          },
        ],
        text: { format: zodTextFormat(extractionSchema, "claims") },
      });
      metrics.addUsage("extract", res.usage);
      return res.output_parsed?.claims ?? [];
    },

    async embed(text) {
      const res = await client.embeddings.create({ model: config.models.embed, input: text });
      metrics.addUsage("embed", { input_tokens: res.usage?.prompt_tokens });
      return res.data[0]!.embedding;
    },

    async verify(c, prior, signal) {
      const priorText = prior.map((p) => `- ${p.claim}${p.verdict ? ` [${p.verdict}]` : ""}`).join("\n") || "(none)";
      const res = await client.responses.parse(
        {
          model: config.models.verify,
          reasoning: { effort: config.verifyEffort as any },
          store: false,
          prompt_cache_key: "veraz-verify",
          tools: [{ type: "web_search", filters: { allowed_domains: domainsFor(c.category, config.verify.maxDomains) } }],
          tool_choice: "required",
          include: ["web_search_call.action.sources"],
          input: [
            { role: "system", content: VERIFY_PROMPT },
            {
              role: "user",
              content: `Today: ${new Date().toISOString().slice(0, 10)}\nLanguage: ${c.language}\nEarlier claims in this conversation:\n${priorText}\n\nClaim to verify:\n${c.claim}`,
            },
          ],
          text: { format: zodTextFormat(verificationSchema, "verification") },
        },
        { signal },
      );
      metrics.addUsage("verify", res.usage);
      if (!res.output_parsed) throw new Error("verification returned no parsed output");
      return keepGroundedSources(res.output_parsed, groundedUrls(res.output as any[]));
    },

    async transcribeChunk(audio, ext) {
      const res = await client.audio.transcriptions.create({
        file: new File([audio as BlobPart], `chunk.${ext}`),
        model: config.models.transcribeChunk,
      });
      return res.text;
    },

    openTranscriber(h) {
      return openRealtimeTranscriber(h);
    },
  };
}

function openRealtimeTranscriber(h: TranscriberHandlers): Transcriber {
  let ws: WebSocket | null = null;
  let ready = false;
  let closed = false;
  const queue: string[] = [];
  const partials = new Map<string, string>();

  const connect = () => {
    ready = false;
    // Bun's WebSocket accepts a headers option.
    ws = new WebSocket("wss://api.openai.com/v1/realtime?intent=transcription", {
      headers: { Authorization: `Bearer ${config.openaiKey}` },
    } as any);
    ws.onopen = () => {
      ws!.send(
        JSON.stringify({
          type: "session.update",
          session: {
            type: "transcription",
            audio: {
              input: {
                format: { type: "audio/pcm", rate: 24000 },
                transcription: { model: config.models.transcribe },
                turn_detection: { type: "server_vad", threshold: config.vad.threshold, silence_duration_ms: config.vad.silenceMs },
              },
            },
          },
        }),
      );
      ready = true;
      for (const m of queue.splice(0)) ws!.send(m);
    };
    ws.onmessage = (ev) => {
      const e = JSON.parse(String(ev.data));
      switch (e.type) {
        case "input_audio_buffer.speech_stopped":
          h.onSpeechStopped();
          break;
        case "conversation.item.input_audio_transcription.delta": {
          const text = (partials.get(e.item_id) ?? "") + e.delta;
          partials.set(e.item_id, text);
          h.onPartial(text);
          break;
        }
        case "conversation.item.input_audio_transcription.completed":
          partials.delete(e.item_id);
          if (e.transcript?.trim()) h.onCompleted(e.transcript.trim());
          break;
        case "error":
          console.error("[realtime]", e.error?.message ?? e);
          break;
      }
    };
    ws.onclose = () => {
      ready = false;
    };
  };
  connect(); // warm before the first word

  return {
    send(pcm) {
      if (closed) return;
      if (!ws || ws.readyState === WebSocket.CLOSED) connect(); // upstream dropped: reconnect on demand
      const msg = JSON.stringify({ type: "input_audio_buffer.append", audio: Buffer.from(pcm).toString("base64") });
      if (ready) ws!.send(msg);
      else queue.push(msg);
    },
    close() {
      closed = true;
      ws?.close();
    },
  };
}

export const createAI = (): AI => (config.mock ? createMockAI() : createRealAI());
