import type { Claim, Favorite, RecheckFavorite, SaveFavorite, Verification } from "@veraz/shared";
import { NotFoundError } from "../../shared/errors.ts";
import { toFavorite } from "./favorite.entity.ts";
import type { ClaimSource, FavoriteRepository } from "./favorite.ports.ts";

export interface FavoriteServiceDeps {
  favorites: FavoriteRepository;
  claims: ClaimSource;
}

/** Save, list and remove favourites. Saving and removing are idempotent, so the app can retry them freely. */
export class FavoriteService {
  private readonly deps: FavoriteServiceDeps;

  constructor(deps: FavoriteServiceDeps) {
    this.deps = deps;
  }

  list(): Favorite[] {
    return this.deps.favorites.list();
  }

  /** Copies the claim from its session. Saving it again returns the first snapshot. */
  save({ sessionId, claimId }: SaveFavorite): Favorite {
    const { favorites, claims } = this.deps;
    const saved = favorites.find(claimId);
    if (saved) return saved;
    const favorite = toFavorite(claims.claim(sessionId, claimId), Date.now());
    favorites.save(favorite);
    return favorite;
  }

  /**
   * Checks a favourite again and keeps the new verdict. With `sessionId`, a claim still in that live session is
   * rechecked there, so its card follows along; otherwise, or once the session is gone, it is checked on its own.
   */
  async recheck(id: string, { sessionId }: RecheckFavorite = {}): Promise<Favorite> {
    const { favorites, claims } = this.deps;
    const favorite = favorites.find(id);
    if (!favorite) throw new NotFoundError(`favorite ${id} not found`);
    const result = (sessionId && (await this.recheckLive(sessionId, id))) || (await claims.verify(favorite));
    // Removed while it was checked: do not bring it back.
    if (!favorites.find(id)) throw new NotFoundError(`favorite ${id} not found`);
    const updated: Favorite = { ...favorite, result, cached: false };
    favorites.save(updated);
    return updated;
  }

  remove(id: string) {
    this.deps.favorites.delete(id);
  }

  /** The new verdict from the live session; null when the session or the claim is gone, so it is checked on its own. */
  private async recheckLive(sessionId: string, id: string): Promise<Verification | null> {
    let claim: Claim | undefined;
    try {
      claim = await this.deps.claims.recheck(sessionId, id);
    } catch (e) {
      if (e instanceof NotFoundError) return null;
      throw e;
    }
    if (claim?.status === "error") throw new Error(claim.error ?? "verification failed");
    return claim?.result ?? null;
  }
}
