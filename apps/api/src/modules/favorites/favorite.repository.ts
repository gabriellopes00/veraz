import { DatabaseSync, type StatementSync } from "node:sqlite";
import type { Favorite } from "@veraz/shared";
import type { FavoriteRepository } from "./favorite.ports.ts";

/** Favourites in SQLite (table `favorites_claims`), one JSON snapshot per claim. */
export class SqliteFavoriteRepository implements FavoriteRepository {
  private readonly selectAll: StatementSync;
  private readonly selectOne: StatementSync;
  private readonly upsert: StatementSync;
  private readonly remove: StatementSync;

  constructor(path: string) {
    const db = new DatabaseSync(path);
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("CREATE TABLE IF NOT EXISTS favorites_claims (id TEXT PRIMARY KEY, claim TEXT NOT NULL, saved_at INTEGER)");
    this.selectAll = db.prepare("SELECT claim FROM favorites_claims ORDER BY saved_at DESC, rowid DESC");
    this.selectOne = db.prepare("SELECT claim FROM favorites_claims WHERE id = ?");
    this.upsert = db.prepare("INSERT OR REPLACE INTO favorites_claims (id, claim, saved_at) VALUES (?, ?, ?)");
    this.remove = db.prepare("DELETE FROM favorites_claims WHERE id = ?");
  }

  list(): Favorite[] {
    return this.selectAll.all().map((r) => JSON.parse(r.claim as string));
  }

  find(id: string): Favorite | undefined {
    const row = this.selectOne.get(id);
    return row && JSON.parse(row.claim as string);
  }

  save(favorite: Favorite) {
    this.upsert.run(favorite.id, JSON.stringify(favorite), favorite.savedAt);
  }

  delete(id: string) {
    this.remove.run(id);
  }
}
