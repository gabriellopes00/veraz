import { isFavorite, recheckFavorite } from "./favorites";
import { currentSessionId, recheckLiveClaim } from "./live";
import { useStore } from "./store";

/**
 * "Revisar": a fresh check of a claim from this conversation, Favoritos, or both. A saved claim goes through the
 * favourites, which also recheck it in the live session when it is listed there, so a single check updates both.
 */
export function recheckClaim(id: string) {
  const sessionId = useStore.getState().claims[id] ? currentSessionId() : null;
  if (isFavorite(id)) void recheckFavorite(id, sessionId ?? undefined);
  else if (sessionId) recheckLiveClaim(id);
}
