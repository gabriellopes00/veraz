import { type CreateSession, clientMessageSchema, serverEventSchema } from "@veraz/shared";
import { API_URL, AUDIO_MODE, WS_URL } from "./config";
import { useStore } from "./store";

// One session + one persistent WebSocket, reconnected with exponential backoff.
let sessionId: string | null = null;
let ws: WebSocket | null = null;
let wanted = false;
let attempt = 0;
let retry: ReturnType<typeof setTimeout> | undefined;

const { apply, set } = useStore.getState();

/** No answer at all from the API: stopped, a wrong IP, or the phone on another network. */
export class ApiUnreachableError extends Error {}

async function createSession(): Promise<string> {
  const body: Partial<CreateSession> = { mode: AUDIO_MODE, sampleRate: 24000 };
  const res = await fetch(`${API_URL}/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).catch((e) => {
    throw new ApiUnreachableError(String(e), { cause: e });
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
      void withApi("Não foi possível retomar a conversa", start);
      return;
    }
    set({ connection: "reconnecting" });
    retry = setTimeout(connect, Math.min(500 * 2 ** attempt++, 8000));
  };
  socket.onerror = () => {}; // onclose follows and handles the retry
}

/** Creates the session if needed and opens the socket. Safe to call repeatedly. Throws ApiUnreachableError. */
export async function start() {
  wanted = true;
  try {
    sessionId ??= await createSession();
    if (!ws) connect();
  } catch (e) {
    set({ connection: "idle" });
    wanted = false;
    throw e;
  }
}

/**
 * Runs an action that needs the API. If the API cannot be reached, the screen shows a card that runs it again;
 * any other failure goes to the error line.
 */
export async function withApi(title: string, action: () => Promise<void>): Promise<void> {
  try {
    await action();
    set({ offline: null });
  } catch (e) {
    if (!(e instanceof ApiUnreachableError))
      return set({ offline: null, error: e instanceof Error ? e.message : String(e) });
    const retry = () => {
      set({ offline: { title, retry, retrying: true } });
      void withApi(title, action);
    };
    set({ offline: { title, retry, retrying: false } });
  }
}

/** The live session's id, or null outside a conversation. */
export const currentSessionId = () => sessionId;

/** Removes a claim here at once and on the server, which cancels its check if it is still running. */
export function deleteClaim(id: string) {
  apply({ type: "claim.removed", id });
  if (sessionId)
    void fetch(`${API_URL}/sessions/${sessionId}/claims/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(
      () => {},
    );
}

/** Asks for a fresh check of a settled claim. It goes back to checking, and the verdict arrives on the socket. */
export function recheckLiveClaim(id: string) {
  if (!sessionId) return;
  fetch(`${API_URL}/sessions/${sessionId}/claims/${encodeURIComponent(id)}/recheck`, { method: "POST" })
    .then((res) => {
      if (!res.ok) throw new Error(`recheck -> ${res.status}`);
    })
    .catch((e) => set({ error: `Não foi possível revisar a afirmação: ${String(e)}` }));
}

/** Binary audio frame. Stale audio is worthless, so frames are dropped while offline. */
export function sendAudio(data: ArrayBuffer) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(data);
}

export async function sendText(text: string) {
  const msg = clientMessageSchema.parse({ type: "text", text });
  await start();
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  else
    await fetch(`${API_URL}/sessions/${sessionId}/text`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
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
