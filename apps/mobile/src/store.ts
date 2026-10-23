import { create } from "zustand";
import type { Claim, ServerEvent, Utterance, Verdict } from "@veraz/shared";

export type Filter = "ALL" | "checking" | Verdict;
export type Connection = "idle" | "connecting" | "open" | "reconnecting";

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
  /** A conversation is under way: set by the first recording, cleared by "Limpar". Pausing keeps it. */
  live: boolean;
  error: string | null;
  apply(e: ServerEvent): void;
  set(p: Partial<Pick<State, "filter" | "connection" | "recording" | "live" | "error">>): void;
  reset(): void;
}

const empty = { claims: {}, order: [], utterances: [], partial: "", error: null };

export const useStore = create<State>((set) => ({
  ...empty,
  filter: "ALL",
  connection: "idle",
  recording: false,
  live: false,
  set: (p) => set(p),
  reset: () => set(empty),
  apply: (e) =>
    set((s) => {
      switch (e.type) {
        case "snapshot": {
          const sorted = [...e.claims].sort((a, b) => b.createdAt - a.createdAt);
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
          const isNew = !s.claims[e.claim.id];
          return {
            claims: { ...s.claims, [e.claim.id]: e.claim },
            order: isNew ? [e.claim.id, ...s.order] : s.order,
          };
        }
        case "claim.removed": {
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
