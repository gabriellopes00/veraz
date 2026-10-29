// Public surface of the favorites module: the facade and wiring, plus the repository for the composition root.
export type { ClaimSource, FavoriteRepository } from "./favorite.ports.ts";
export { SqliteFavoriteRepository } from "./favorite.repository.ts";
export {
  createFavoritesModule,
  type FavoritesDeps,
  type FavoritesFacade,
  type FavoritesModule,
} from "./favorites.module.ts";
