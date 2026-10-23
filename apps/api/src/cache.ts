import { Database } from "bun:sqlite";
import type { Verification } from "@veraz/shared";
import { cosine } from "./audio";

interface Entry {
  emb: Float32Array;
  result: Verification;
  at: number;
}

/** Cross-session verdict cache: persisted in SQLite, searched in memory by embedding similarity. */
export class VerdictCache {
  private db: Database;
  private entries: Entry[] = [];

  constructor(path: string, private ttlMs: number) {
    this.db = new Database(path, { create: true });
    this.db.run("PRAGMA journal_mode = WAL");
    this.db.run(
      "CREATE TABLE IF NOT EXISTS verdicts (id INTEGER PRIMARY KEY, claim TEXT, emb BLOB, result TEXT, at INTEGER)",
    );
    this.db.run("DELETE FROM verdicts WHERE at < ?", [Date.now() - ttlMs]);
    for (const r of this.db.query("SELECT emb, result, at FROM verdicts").all() as any[]) {
      const buf = r.emb as Uint8Array;
      this.entries.push({
        emb: new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)),
        result: JSON.parse(r.result),
        at: r.at,
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
      if (sim >= bestSim) (best = e), (bestSim = sim);
    }
    return best?.result ?? null;
  }

  store(claim: string, emb: number[], result: Verification) {
    const e: Entry = { emb: new Float32Array(emb), result, at: Date.now() };
    this.entries.push(e);
    this.db.run("INSERT INTO verdicts (claim, emb, result, at) VALUES (?, ?, ?, ?)", [
      claim,
      new Uint8Array(e.emb.buffer),
      JSON.stringify(result),
      e.at,
    ]);
  }
}
