export interface TurnDetectorOptions {
  /** Frames at or above this level (dBFS) count as speech. */
  speechDb: number;
  /** Trailing silence that ends a turn. */
  silenceMs: number;
  /** A turn this long is committed at the next quiet frame, so a nonstop speaker still produces utterances. */
  maxTurnMs: number;
}

/** Less speech than this is a click or a cough: it waits for more instead of ending a turn on its own. */
const MIN_SPEECH_MS = 150;
/** Past `maxTurnMs`, commit even mid-word after this much more. */
const HARD_CAP_EXTRA_MS = 5000;

/**
 * Client-side end-of-turn detection for streaming transcription models that have no server VAD.
 * Feed it every PCM16 frame; it says when to commit the upstream audio buffer.
 */
export class TurnDetector {
  private readonly opts: TurnDetectorOptions;
  private turnMs = 0;
  private speechMs = 0;
  private silenceMs = 0;

  constructor(opts: TurnDetectorOptions) {
    this.opts = opts;
  }

  /** Whether the turn ends with this frame, and whether that turn held real speech. */
  push(pcm16: Uint8Array, sampleRate: number): { commit: boolean; spoke: boolean } {
    const samples = pcm16.byteLength >> 1;
    if (samples === 0) return { commit: false, spoke: false };
    const ms = (samples * 1000) / sampleRate;
    const loud = levelDb(pcm16) >= this.opts.speechDb;

    this.turnMs += ms;
    if (loud) {
      this.speechMs += ms;
      this.silenceMs = 0;
    } else {
      this.silenceMs += ms;
    }

    const spoke = this.speechMs >= MIN_SPEECH_MS;
    const ended =
      (spoke && this.silenceMs >= this.opts.silenceMs) ||
      (this.turnMs >= this.opts.maxTurnMs && !loud) ||
      this.turnMs >= this.opts.maxTurnMs + HARD_CAP_EXTRA_MS;
    if (!ended) return { commit: false, spoke: false };
    this.turnMs = this.speechMs = this.silenceMs = 0;
    return { commit: true, spoke };
  }
}

/** RMS level of a PCM16 little-endian frame, in dBFS. */
export function levelDb(pcm16: Uint8Array): number {
  const view = new DataView(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength);
  const n = pcm16.byteLength >> 1;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const s = view.getInt16(i * 2, true);
    sum += s * s;
  }
  const rms = Math.sqrt(sum / Math.max(1, n)) / 32768;
  return 20 * Math.log10(rms || 1e-6);
}
