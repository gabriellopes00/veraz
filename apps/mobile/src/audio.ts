import { useRef } from "react";
import { AudioModule, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioStream } from "expo-audio";
import { resamplePcm16 } from "@veraz/shared";
import { AUDIO_MODE } from "./config";
import { sendAudio } from "./live";

/** What the Live screen needs from the microphone, whatever the transport. */
export interface AudioTransport {
  start(): Promise<void>;
  stop(): Promise<void>;
}

const TARGET_RATE = 24000;
const CHUNK_MS = 5000;

async function prepareMic() {
  const perm = await requestRecordingPermissionsAsync();
  if (!perm.granted) throw new Error("Permissão de microfone negada");
  // iOS: playAndRecord session, keep working with the silent switch on.
  await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
}

/** `pcm-stream`: raw PCM16 frames straight from the mic (~100 ms each) over the WebSocket. */
function usePcmStream(): AudioTransport {
  const { stream } = useAudioStream({
    sampleRate: TARGET_RATE,
    channels: 1,
    encoding: "int16",
    onBuffer: (b) => {
      if (b.sampleRate === TARGET_RATE) return sendAudio(b.data);
      const out = resamplePcm16(new Uint8Array(b.data), b.sampleRate, TARGET_RATE); // hardware gave another rate
      sendAudio(out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer);
    },
  });
  return {
    async start() {
      await prepareMic();
      await stream.start();
    },
    async stop() {
      stream.stop();
    },
  };
}

/**
 * `chunked`: back-to-back short recordings. The next recorder is already recording
 * before the current one stops, so no speech falls into a gap.
 */
function useChunked(): AudioTransport {
  const running = useRef(false);
  const wake = useRef<(() => void) | null>(null);
  const done = useRef<Promise<void>>(Promise.resolve());

  const newRecorder = async () => {
    const r = new AudioModule.AudioRecorder(RecordingPresets.HIGH_QUALITY);
    await r.prepareToRecordAsync();
    return r;
  };

  async function loop() {
    let cur = await newRecorder();
    cur.record();
    while (true) {
      await new Promise<void>((resolve) => {
        wake.current = resolve;
        setTimeout(resolve, CHUNK_MS);
      });
      const next = running.current ? await newRecorder() : null;
      next?.record();
      await cur.stop();
      if (cur.uri) sendAudio(await (await fetch(cur.uri)).arrayBuffer());
      if (!next) return;
      cur = next;
    }
  }

  return {
    async start() {
      await prepareMic();
      running.current = true;
      done.current = loop();
    },
    async stop() {
      running.current = false;
      wake.current?.();
      await done.current;
    },
  };
}

export const useAudioTransport: () => AudioTransport = AUDIO_MODE === "chunked" ? useChunked : usePcmStream;
