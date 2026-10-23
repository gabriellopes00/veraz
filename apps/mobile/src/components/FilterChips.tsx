import { memo } from "react";
import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { useShallow } from "zustand/react/shallow";
import { VERDICTS, VERDICT_INFO } from "@veraz/shared";
import { useStore, type Filter } from "../store";
import { useTheme } from "../theme";

export const FilterChips = memo(function FilterChips() {
  const t = useTheme();
  const filter = useStore((s) => s.filter);
  // Count per filter; shallow-compared so the chips only re-render when a count changes.
  const counts = useStore(
    useShallow((s) => {
      const out: Record<string, number> = { ALL: s.order.length, checking: 0 };
      for (const id of s.order) {
        const c = s.claims[id];
        if (!c) continue;
        if (c.status === "checking") out.checking = out.checking! + 1;
        const v = c.result?.verdict;
        if (v) out[v] = (out[v] ?? 0) + 1;
      }
      return out;
    }),
  );

  const chips: { key: Filter; label: string; color: string }[] = [
    { key: "ALL", label: "Todos", color: t.accent },
    { key: "checking", label: "Verificando", color: t.sub },
    ...VERDICTS.map((v) => ({ key: v as Filter, label: VERDICT_INFO[v].pt, color: VERDICT_INFO[v].color })),
  ];

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} style={styles.scroll}>
      {chips
        .filter((c) => c.key === "ALL" || c.key === filter || (counts[c.key] ?? 0) > 0)
        .map((c) => {
          const active = filter === c.key;
          return (
            <Pressable
              key={c.key}
              onPress={() => useStore.getState().set({ filter: c.key })}
              style={[styles.chip, { borderColor: c.color, backgroundColor: active ? c.color : "transparent" }]}
            >
              <Text style={{ color: active ? "#fff" : c.color, fontWeight: "600", fontSize: 13 }}>
                {c.label} {counts[c.key] ?? 0}
              </Text>
            </Pressable>
          );
        })}
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  scroll: { flexGrow: 0 },
  row: { paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1.5 },
});
