import type { FactcheckSession } from "./session.entity.ts";

/** Live sessions are in memory only: a restart drops them and the app starts a new one. */
export class SessionRepository {
  private readonly sessions = new Map<string, FactcheckSession>();

  save(session: FactcheckSession) {
    this.sessions.set(session.id, session);
  }

  find(id: string): FactcheckSession | undefined {
    return this.sessions.get(id);
  }

  delete(id: string) {
    this.sessions.delete(id);
  }

  get size() {
    return this.sessions.size;
  }
}
