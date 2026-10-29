import { type Claim, type Favorite, favoriteSchema } from "@veraz/shared";
import { create } from "zustand";
import { API_URL } from "./config";
import { currentSessionId } from "./live";
import { useStore } from "./store";

// Favourites live on the API (GET/POST/DELETE /favorites). Changes show up at once and roll back if the call fails.
// The rest of the app only goes through the hooks and functions below.

/** `failed` and `retrying` keep the error showing, so a retry does not make it flicker away and back. */
export type FavoritesStatus = "idle" | "loading" | "ready" | "failed" | "retrying";

interface FavoritesState {
  /** Newest first. A snapshot of each claim, so it outlives the session it came from. */
  items: Favorite[];
  status: FavoritesStatus;
  /** Ids waiting for a fresh verdict. */
  rechecking: string[];
}

const useFavoritesStore = create<FavoritesState>(() => ({ items: [], status: "idle", rechecking: [] }));
const { getState, setState } = useFavoritesStore;

export const useFavorites = () => useFavoritesStore((s) => s.items);

export const useFavoritesStatus = () => useFavoritesStore((s) => s.status);

export const useIsFavorite = (id: string) => useFavoritesStore((s) => s.items.some((c) => c.id === id));

export const useFavorite = (id: string) => useFavoritesStore((s) => s.items.find((c) => c.id === id));

export const useIsRechecking = (id: string) => useFavoritesStore((s) => s.rechecking.includes(id));

export const isFavorite = (id: string) => getState().items.some((c) => c.id === id);

const listSchema = favoriteSchema.array();

async function request(method: string, path: string, body?: unknown) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}`);
  return res.status === 204 ? null : res.json();
}

/** Puts `before` back and says why. */
const rollback = (before: Favorite[], what: string) => (e: unknown) => {
  setState({ items: before });
  useStore.getState().set({ error: `Não foi possível ${what} o favorito: ${String(e)}` });
};

/** A failure shows in the Favoritos section itself, which offers a retry. */
export async function loadFavorites() {
  const { status } = getState();
  if (status === "loading" || status === "retrying") return;
  setState({ status: status === "failed" ? "retrying" : "loading" });
  try {
    setState({ items: listSchema.parse(await request("GET", "/favorites")), status: "ready" });
  } catch (e) {
    console.warn(`GET ${API_URL}/favorites failed:`, e);
    setState({ status: "failed" });
  }
}

/** Loads on first use, and tries again after a failure; a no-op once loaded. */
export function ensureFavorites() {
  const { status } = getState();
  if (status === "idle" || status === "failed") void loadFavorites();
}

/** Only verified claims can be saved: a favourite is a checked fact to come back to. */
export function toggleFavorite(claim: Claim) {
  if (isFavorite(claim.id)) return removeFavorite(claim.id);
  const sessionId = currentSessionId();
  if (claim.status !== "verified" || !claim.result || !sessionId) return;
  const before = getState().items;
  // The server copies the claim from its session; the local snapshot is replaced by its answer.
  setState({ items: [{ ...claim, status: "verified", result: claim.result, savedAt: Date.now() }, ...before] });
  request("POST", "/favorites", { sessionId, claimId: claim.id })
    .then((saved) => {
      const favorite = favoriteSchema.parse(saved);
      setState((s) => ({ items: s.items.map((c) => (c.id === favorite.id ? favorite : c)) }));
    })
    .catch(rollback(before, "salvar"));
}

/** Keeps the old verdict on screen until the new one replaces it. With `sessionId`, the live card follows along. */
export async function recheckFavorite(id: string, sessionId?: string) {
  if (getState().rechecking.includes(id)) return;
  setState((s) => ({ rechecking: [...s.rechecking, id] }));
  try {
    const body = sessionId ? { sessionId } : {};
    const favorite = favoriteSchema.parse(await request("POST", `/favorites/${encodeURIComponent(id)}/recheck`, body));
    setState((s) => ({ items: s.items.map((c) => (c.id === id ? favorite : c)) }));
  } catch (e) {
    // Removed while it was checked: nothing left to update.
    if (isFavorite(id)) useStore.getState().set({ error: `Não foi possível revisar o favorito: ${String(e)}` });
  } finally {
    setState((s) => ({ rechecking: s.rechecking.filter((r) => r !== id) }));
  }
}

export function removeFavorite(id: string) {
  const before = getState().items;
  if (!before.some((c) => c.id === id)) return;
  setState({ items: before.filter((c) => c.id !== id) });
  request("DELETE", `/favorites/${encodeURIComponent(id)}`).catch(rollback(before, "remover"));
}
