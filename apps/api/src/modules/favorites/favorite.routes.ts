import { recheckFavoriteSchema, saveFavoriteSchema } from "@veraz/shared";
import type { FastifyPluginAsync } from "fastify";
import { InvalidInputError } from "../../shared/errors.ts";
import type { FavoriteService } from "./favorite.service.ts";

/** HTTP transport. Parses input, calls one service operation, maps the result. */
export const favoriteRoutes =
  (favorites: FavoriteService): FastifyPluginAsync =>
  async (app) => {
    app.get("/favorites", async () => favorites.list());

    app.post("/favorites", async (req, reply) => {
      const input = saveFavoriteSchema.safeParse(req.body ?? {});
      if (!input.success) throw new InvalidInputError(input.error.message);
      return reply.code(201).send(favorites.save(input.data));
    });

    // Answers once the new verdict is in, with the updated favourite.
    app.post<{ Params: { id: string } }>("/favorites/:id/recheck", async (req) => {
      const input = recheckFavoriteSchema.safeParse(req.body ?? {});
      if (!input.success) throw new InvalidInputError(input.error.message);
      return favorites.recheck(req.params.id, input.data);
    });

    app.delete<{ Params: { id: string } }>("/favorites/:id", async (req, reply) => {
      favorites.remove(req.params.id);
      return reply.code(204).send();
    });
  };
