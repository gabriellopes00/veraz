export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const AUDIO_MODE: "pcm-stream" | "chunked" =
  process.env.EXPO_PUBLIC_AUDIO_MODE === "chunked" ? "chunked" : "pcm-stream";
export const WS_URL = API_URL.replace(/^http/, "ws");
