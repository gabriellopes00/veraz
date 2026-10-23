import { memo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useShallow } from "zustand/react/shallow";
import { VERDICTS, VERDICT_INFO } from "@veraz/shared";
import { useStore, type Filter } from "../store";
import { colors, IOS, radius, type } from "../theme";
import { Surface, SurfaceGroup } from "./Glass";

// iOS: green-tinted glass marks the active chip. Android: design.md category tabs (surface vs transparent).
const ACTIVE = IOS ? { tint: colors.primary, text: colors.onPrimary, count: colors.onPrimary } : { tint: colors.surfaceElevated, text: colors.onDark, count: colors.body };
const IDLE = IOS ? { tint: undefined, text: colors.bodyStrong, count: colors.muted } : { tint: "transparent", text: colors.muted, count: colors.mutedSoft };

export const FilterChips = memo(function FilterChips() {
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

  // Nothing to filter yet: the row only appears once the first claim is identified.
  if (counts.ALL === 0) return null;

  const chips: { key: Filter; label: string; color?: string }[] = [
    { key: "ALL", label: "Todos" },
    { key: "checking", label: "Verificando", color: colors.muted },
    ...VERDICTS.map((v) => ({ key: v as Filter, label: VERDICT_INFO[v].pt, color: VERDICT_INFO[v].color })),
  ];

  return (
    <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(150)}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll}>
        <SurfaceGroup spacing={6} style={styles.row}>
          {chips
            .filter((c) => c.key === "ALL" || c.key === filter || (counts[c.key] ?? 0) > 0)
            .map((c) => {
              const s = filter === c.key ? ACTIVE : IDLE;
              return (
                <Surface key={c.key} interactive tint={s.tint} style={styles.chip}>
                  <Pressable onPress={() => useStore.getState().set({ filter: c.key })} style={styles.hit}>
                    {c.color && <View style={[styles.dot, { backgroundColor: c.color }]} />}
                    <Text style={[styles.label, { color: s.text }]}>{c.label}</Text>
                    <Text style={[styles.label, { color: s.count }]}>{counts[c.key] ?? 0}</Text>
                  </Pressable>
                </Surface>
              );
            })}
        </SurfaceGroup>
      </ScrollView>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  scroll: { flexGrow: 0 },
  row: { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  chip: { borderRadius: IOS ? radius.pill : radius.md },
  hit: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: IOS ? 9 : 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { ...type.caption, ...(IOS ? { fontWeight: "600" } : null) },
});
