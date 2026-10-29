import { resamplePcm16 } from "@veraz/shared";
import {
  AudioModule,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioStream,
} from "expo-audio";
import { useRef } from "react";
import { AUDIO_MODE } from "./config";
import { sendAudio } from "./live";

/** What the Live screen needs from the microphone, whatever the transport. */
export interface AudioTransport {
  start(): Promise<void>;
  stop(): Promise<void>;
}

const TARGET_RATE = 24000;
const CHUNK_MS = 5000;
/** One mic level per this much audio. The waveform draws one bar per level, so this also sets its scroll speed. */
export const LEVEL_MS = 70;

type LevelListener = (db: number) => void;
const levelListeners = new Set<LevelListener>();

/** Mic loudness while recording in dBFS (-100..0), one per LEVEL_MS of audio. Drives the waveform; kept out of the store on purpose. */
export function onLevel(fn: LevelListener) {
  levelListeners.add(fn);
  return () => void levelListeners.delete(fn);
}

/**
 * Raw dBFS, no fixed scale: how loud speech arrives depends on the device and the audio session (an iPhone over
 * `pcm-stream` sits around -70..-55 dBFS), so the waveform scales to what it hears.
 */
function emitLevel(db: number) {
  const level = Math.max(-100, db);
  for (const fn of levelListeners) fn(level);
}

/** The slice in progress. Carried across buffers so every level covers exactly LEVEL_MS, whatever the buffer size. */
let sliceSum = 0;
let sliceLen = 0;

/** One level per LEVEL_MS slice of PCM16. */
function emitPcmLevels(data: ArrayBuffer, sampleRate: number) {
  const pcm = new Int16Array(data, 0, data.byteLength >> 1);
  const step = Math.max(1, Math.round((sampleRate * LEVEL_MS) / 1000));
  for (let i = 0; i < pcm.length; i++) {
    sliceSum += pcm[i]! * pcm[i]!;
    if (++sliceLen < step) continue;
    const rms = Math.sqrt(sliceSum / sliceLen) / 32768;
    sliceSum = sliceLen = 0;
    emitLevel(20 * Math.log10(rms || 1e-6));
  }
}

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
      emitPcmLevels(b.data, b.sampleRate);
      if (b.sampleRate === TARGET_RATE) return sendAudio(b.data);
      const out = resamplePcm16(new Uint8Array(b.data), b.sampleRate, TARGET_RATE); // hardware gave another rate
      sendAudio(out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer);
    },
  });
  return {
    async start() {
      await prepareMic();
      sliceSum = sliceLen = 0;
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
  const meter = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const newRecorder = async () => {
    const r = new AudioModule.AudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
    await r.prepareToRecordAsync();
    return r;
  };

  async function loop() {
    let cur = await newRecorder();
    cur.record();
    meter.current = setInterval(() => {
      const db = cur.getStatus().metering;
      if (db != null) emitLevel(db);
    }, LEVEL_MS);
    try {
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
    } finally {
      clearInterval(meter.current);
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
