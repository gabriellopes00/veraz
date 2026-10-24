import { DatabaseSync, type StatementSync } from "node:sqlite";
import type { Verification } from "@veraz/shared";
import { cosine } from "../../../shared/vector.ts";
import type { VerdictCache } from "./verification.ports.ts";

interface Entry {
  emb: Float32Array;
  result: Verification;
  at: number;
}

/** Cross-session verdict cache: persisted in SQLite (table `factcheck_verdicts`), searched in memory. */
export class SqliteVerdictCache implements VerdictCache {
  private readonly db: DatabaseSync;
  private readonly insert: StatementSync;
  private readonly entries: Entry[] = [];
  private readonly ttlMs: number;

  constructor(path: string, ttlMs: number) {
    this.ttlMs = ttlMs;
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS factcheck_verdicts (id INTEGER PRIMARY KEY, claim TEXT, emb BLOB, result TEXT, at INTEGER)",
    );
    this.db.prepare("DELETE FROM factcheck_verdicts WHERE at < ?").run(Date.now() - ttlMs);
    this.insert = this.db.prepare("INSERT INTO factcheck_verdicts (claim, emb, result, at) VALUES (?, ?, ?, ?)");
    for (const r of this.db.prepare("SELECT emb, result, at FROM factcheck_verdicts").all()) {
      const buf = r.emb as Uint8Array;
      this.entries.push({
        emb: new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)),
        result: JSON.parse(r.result as string),
        at: r.at as number,
      });
    }
  }

  lookup(emb: ArrayLike<number>, threshold: number): Verification | null {
    const now = Date.now();
    let best: Entry | null = null;
    let bestSim = threshold;
    for (const e of this.entries) {
      if (now - e.at > this.ttlMs) continue;
      const sim = cosine(emb, e.emb);
      if (sim >= bestSim) {
        best = e;
        bestSim = sim;
      }
    }
    return best?.result ?? null;
  }

  store(claim: string, emb: number[], result: Verification) {
    const e: Entry = { emb: new Float32Array(emb), result, at: Date.now() };
    this.entries.push(e);
    this.insert.run(claim, new Uint8Array(e.emb.buffer), JSON.stringify(result), e.at);
  }
}
