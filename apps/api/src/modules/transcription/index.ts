// Public surface of the transcription module: the port, plus the adapters for the composition root.
export { MockTranscription } from "./transcription.mock.adapter.ts";
export { OpenAITranscription } from "./transcription.openai.adapter.ts";
export type { TranscriptHandlers, Transcription, TranscriptStream } from "./transcription.port.ts";
export { SAMPLE_PT } from "./transcription.sample.ts";
