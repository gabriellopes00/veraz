import { clientMessageSchema, serverEventSchema, type CreateSession } from "@veraz/shared";
import { API_URL, AUDIO_MODE, WS_URL } from "./config";
import { useStore } from "./store";

// One session + one persistent WebSocket, reconnected with exponential backoff.
let sessionId: string | null = null;
let ws: WebSocket | null = null;
let wanted = false;
let attempt = 0;
let retry: ReturnType<typeof setTimeout> | undefined;

const { apply, set } = useStore.getState();

async function createSession(): Promise<string> {
  const body: Partial<CreateSession> = { mode: AUDIO_MODE, sampleRate: 24000 };
  const res = await fetch(`${API_URL}/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST /sessions -> ${res.status}`);
  return ((await res.json()) as { id: string }).id;
}

function connect() {
  if (!sessionId) return;
  set({ connection: attempt === 0 ? "connecting" : "reconnecting" });
  const socket = new WebSocket(`${WS_URL}/sessions/${sessionId}/ws`);
  ws = socket;
  socket.binaryType = "arraybuffer";
  socket.onopen = () => {
    attempt = 0;
    set({ connection: "open", error: null });
  };
  socket.onmessage = (m) => {
    if (typeof m.data !== "string") return;
    const parsed = serverEventSchema.safeParse(JSON.parse(m.data));
    if (parsed.success) apply(parsed.data);
  };
  socket.onclose = (ev) => {
    if (ws !== socket) return; // replaced or stopped on purpose
    ws = null;
    if (!wanted) return set({ connection: "idle" });
    if (ev.code === 4004) {
      // The server forgot this session (restart): start a fresh one.
      sessionId = null;
      useStore.getState().reset();
      void start();
      return;
    }
    set({ connection: "reconnecting" });
    retry = setTimeout(connect, Math.min(500 * 2 ** attempt++, 8000));
  };
  socket.onerror = () => {}; // onclose follows and handles the retry
}

/** Creates the session if needed and opens the socket. Safe to call repeatedly. */
export async function start() {
  wanted = true;
  try {
    sessionId ??= await createSession();
    if (!ws) connect();
  } catch (e) {
    set({ error: `Não foi possível conectar à API (${API_URL}): ${String(e)}`, connection: "idle" });
    wanted = false;
    throw e;
  }
}

/** Binary audio frame. Stale audio is worthless, so frames are dropped while offline. */
export function sendAudio(data: ArrayBuffer) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(data);
}

export async function sendText(text: string) {
  const msg = clientMessageSchema.parse({ type: "text", text });
  await start();
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  else await fetch(`${API_URL}/sessions/${sessionId}/text`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
}

/** Ends the session on the server and clears local state. */
export async function endSession() {
  wanted = false;
  clearTimeout(retry);
  const id = sessionId;
  sessionId = null;
  const socket = ws;
  ws = null;
  socket?.close();
  useStore.getState().reset();
  set({ connection: "idle" });
  if (id) await fetch(`${API_URL}/sessions/${id}`, { method: "DELETE" }).catch(() => {});
}
