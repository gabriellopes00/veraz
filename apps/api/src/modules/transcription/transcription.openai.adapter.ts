import { resamplePcm16 } from "@veraz/shared";
import { type OpenAI, toFile } from "openai";
import WebSocket from "ws";
import type { Config } from "../../config.ts";
import type { TranscriptHandlers, Transcription, TranscriptStream } from "./transcription.port.ts";

const REALTIME_URL = "wss://api.openai.com/v1/realtime?intent=transcription";
/** The Realtime API takes PCM16 at 24 kHz only. */
const REALTIME_RATE = 24000;

type Options = Pick<Config, "openaiKey" | "models" | "vad">;

/** The subset of Realtime server events we react to. */
interface RealtimeEvent {
  type: string;
  item_id?: string;
  delta?: string;
  transcript?: string;
  error?: { message?: string };
}

export class OpenAITranscription implements Transcription {
  private readonly client: OpenAI;
  private readonly opts: Options;

  constructor(client: OpenAI, opts: Options) {
    this.client = client;
    this.opts = opts;
  }

  openStream(sampleRate: number, h: TranscriptHandlers): TranscriptStream {
    return openRealtimeStream(this.opts, sampleRate, h);
  }

  async transcribeFile(audio: Uint8Array, ext: string) {
    const res = await this.client.audio.transcriptions.create({
      file: await toFile(audio, `chunk.${ext}`),
      model: this.opts.models.transcribeChunk,
    });
    return res.text;
  }
}

function openRealtimeStream(opts: Options, sampleRate: number, h: TranscriptHandlers): TranscriptStream {
  let ws: WebSocket | null = null;
  let ready = false;
  let closed = false;
  const queue: string[] = [];
  const partials = new Map<string, string>();

  const onEvent = (e: RealtimeEvent) => {
    switch (e.type) {
      case "input_audio_buffer.speech_stopped":
        h.onSpeechStopped();
        break;
      case "conversation.item.input_audio_transcription.delta": {
        const id = e.item_id ?? "";
        const text = (partials.get(id) ?? "") + (e.delta ?? "");
        partials.set(id, text);
        h.onPartial(text);
        break;
      }
      case "conversation.item.input_audio_transcription.completed":
        partials.delete(e.item_id ?? "");
        if (e.transcript?.trim()) h.onCompleted(e.transcript.trim());
        break;
      case "error":
        console.error("[realtime]", e.error?.message ?? e);
        break;
    }
  };

  const connect = () => {
    ready = false;
    const socket = new WebSocket(REALTIME_URL, { headers: { Authorization: `Bearer ${opts.openaiKey}` } });
    ws = socket;
    socket.on("open", () => {
      socket.send(
        JSON.stringify({
          type: "session.update",
          session: {
            type: "transcription",
            audio: {
              input: {
                format: { type: "audio/pcm", rate: REALTIME_RATE },
                transcription: { model: opts.models.transcribe },
                turn_detection: {
                  type: "server_vad",
                  threshold: opts.vad.threshold,
                  silence_duration_ms: opts.vad.silenceMs,
                },
              },
            },
          },
        }),
      );
      ready = true;
      for (const m of queue.splice(0)) socket.send(m);
    });
    socket.on("message", (data) => onEvent(JSON.parse(data.toString()) as RealtimeEvent));
    socket.on("close", () => {
      ready = false;
    });
    socket.on("error", (err) => console.error("[realtime]", err.message)); // "close" follows; the next frame reconnects
  };
  connect(); // warm before the first word

  return {
    send(pcm) {
      if (closed) return;
      if (!ws || ws.readyState === WebSocket.CLOSED) connect(); // upstream dropped: reconnect on demand
      const out = resamplePcm16(pcm, sampleRate, REALTIME_RATE);
      const audio = Buffer.from(out.buffer, out.byteOffset, out.byteLength).toString("base64");
      const msg = JSON.stringify({ type: "input_audio_buffer.append", audio });
      if (ready) ws!.send(msg);
      else queue.push(msg);
    },
    close() {
      closed = true;
      ws?.close();
    },
  };
}
