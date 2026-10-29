import type { Claim, ServerEvent, Utterance, Verdict } from "@veraz/shared";
import { create } from "zustand";

export type Filter = "ALL" | "checking" | Verdict;
export type Connection = "idle" | "connecting" | "open" | "reconnecting";

export interface Offline {
  /** "Não foi possível começar a gravar", for instance. */
  title: string;
  retry: () => void;
  retrying: boolean;
}

interface State {
  /** Normalized: one entry per claim, so updating a claim only re-renders its own card. */
  claims: Record<string, Claim>;
  /** Claim ids, newest first. */
  order: string[];
  utterances: Utterance[];
  partial: string;
  filter: Filter;
  connection: Connection;
  recording: boolean;
  /** A conversation is under way: set by the first recording, cleared by the trash button. Pausing keeps it. */
  live: boolean;
  error: string | null;
  /** The API could not be reached: what to try again, and whether that is under way. Shown as a card, not `error`. */
  offline: Offline | null;
  apply(e: ServerEvent): void;
  set(p: Partial<Pick<State, "filter" | "connection" | "recording" | "live" | "error" | "offline">>): void;
  reset(): void;
}

const empty = { claims: {}, order: [], utterances: [], partial: "", error: null, offline: null };

/**
 * Claims removed in this conversation. An event already on the wire when the user deleted a claim (its verdict, or
 * a snapshot after a reconnect) must not bring it back. Not state: nothing renders it.
 */
const removed = new Set<string>();

export const useStore = create<State>((set) => ({
  ...empty,
  filter: "ALL",
  connection: "idle",
  recording: false,
  live: false,
  set: (p) => set(p),
  reset: () => {
    removed.clear();
    set(empty);
  },
  apply: (e) =>
    set((s) => {
      switch (e.type) {
        case "snapshot": {
          const sorted = e.claims.filter((c) => !removed.has(c.id)).sort((a, b) => b.createdAt - a.createdAt);
          return {
            claims: Object.fromEntries(sorted.map((c) => [c.id, c])),
            order: sorted.map((c) => c.id),
            utterances: e.utterances,
            partial: "",
          };
        }
        case "partial":
          return { partial: e.text };
        case "utterance":
          // Enough for the transcript to scroll back through a long conversation.
          return { utterances: [...s.utterances, e.utterance].slice(-300), partial: "" };
        case "claim": {
          if (removed.has(e.claim.id)) return {};
          const isNew = !s.claims[e.claim.id];
          return {
            claims: { ...s.claims, [e.claim.id]: e.claim },
            order: isNew ? [e.claim.id, ...s.order] : s.order,
          };
        }
        case "claim.removed": {
          removed.add(e.id);
          const { [e.id]: _, ...rest } = s.claims;
          return { claims: rest, order: s.order.filter((id) => id !== e.id) };
        }
        case "error":
          return { error: e.message };
      }
    }),
}));

export function matchesFilter(c: Claim | undefined, f: Filter): boolean {
  if (!c) return false;
  if (f === "ALL") return true;
  if (f === "checking") return c.status === "checking";
  return c.result?.verdict === f;
}
