import type { FastifyPluginAsync } from "fastify";
import { favoriteRoutes } from "./favorite.routes.ts";
import { FavoriteService, type FavoriteServiceDeps } from "./favorite.service.ts";

/** Everything the rest of the API may do with favourites. */
export type FavoritesFacade = Pick<FavoriteService, "list" | "save" | "recheck" | "remove">;

export interface FavoritesModule {
  facade: FavoritesFacade;
  routes: FastifyPluginAsync;
}

export type FavoritesDeps = FavoriteServiceDeps;

export function createFavoritesModule(deps: FavoritesDeps): FavoritesModule {
  const service = new FavoriteService(deps);
  return { facade: service, routes: favoriteRoutes(service) };
}
