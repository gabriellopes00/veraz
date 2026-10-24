/** Callbacks of a live transcript. */
export interface TranscriptHandlers {
  /** Running text of the utterance being spoken. */
  onPartial(text: string): void;
  /** The speaker stopped (end of speech, before the final text arrives). */
  onSpeechStopped(): void;
  /** Final text of a finished utterance. */
  onCompleted(text: string): void;
}

export interface TranscriptStream {
  /** PCM16 mono little-endian frame, at the sample rate the stream was opened with. */
  send(pcm16: Uint8Array): void;
  close(): void;
}

/** Speech-to-text, as the rest of the API sees it. */
export interface Transcription {
  /** Opens the upstream connection right away, so it is warm before the first word. */
  openStream(sampleRate: number, handlers: TranscriptHandlers): TranscriptStream;
  /** Transcribes one complete audio file (`chunked` mode). */
  transcribeFile(audio: Uint8Array, ext: string): Promise<string>;
}
