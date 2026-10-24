import { setTimeout as sleep } from "node:timers/promises";
import type { TranscriptHandlers, Transcription, TranscriptStream } from "./transcription.port.ts";
import { SAMPLE_PT } from "./transcription.sample.ts";

/** Fake speech-to-text: no network, no keys. */
export class MockTranscription implements Transcription {
  /** Emits the next sample sentence for every ~2 s of audio received. */
  openStream(sampleRate: number, h: TranscriptHandlers): TranscriptStream {
    const bytesPerUtterance = sampleRate * 2 * 2;
    let bytes = 0;
    let i = 0;
    let closed = false;
    return {
      send(pcm) {
        bytes += pcm.byteLength;
        if (closed || bytes < bytesPerUtterance) return;
        bytes = 0;
        const text = SAMPLE_PT[i++ % SAMPLE_PT.length]!;
        h.onPartial(text.slice(0, Math.ceil(text.length / 2)));
        h.onSpeechStopped();
        setTimeout(() => !closed && h.onCompleted(text), 100);
      },
      close() {
        closed = true;
      },
    };
  }

  async transcribeFile() {
    await sleep(50);
    return SAMPLE_PT[1]!;
  }
}
