import { type Source, VERDICT_INFO } from "@veraz/shared";
import { useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useRef } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AiNotice } from "../../src/components/AiNotice";
import { ClaimActions } from "../../src/components/ClaimActions";
import { CheckingBadge, VerdictBadge } from "../../src/components/VerdictBadge";
import { useFavorite } from "../../src/favorites";
import { useStore } from "../../src/store";
import { card, colors, space, type } from "../../src/theme";

const STANCE = {
  supports: { icon: "✓", color: colors.success, pt: "apoia" },
  refutes: { icon: "✗", color: colors.danger, pt: "refuta" },
  context: { icon: "ℹ", color: colors.muted, pt: "contexto" },
} as const;

function SourceRow({ s, first }: { s: Source; first: boolean }) {
  const st = STANCE[s.stance];
  return (
    <Pressable
      onPress={() => WebBrowser.openBrowserAsync(s.url)}
      style={({ pressed }) => [styles.source, !first && styles.divider, pressed && styles.pressed]}
    >
      <Text style={[styles.stance, { color: st.color }]}>{st.icon}</Text>
      <View style={styles.flex}>
        <Text style={styles.sourceTitle} numberOfLines={2}>
          {s.title}
        </Text>
        <Text style={styles.meta}>
          {s.outlet}
          {s.published_at ? ` · ${s.published_at}` : ""} · {st.pt}
        </Text>
      </View>
    </Pressable>
  );
}

export default function ClaimDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const live = useStore((s) => s.claims[id]);
  const saved = useFavorite(id);
  const found = live ?? saved;
  // Keep showing the claim if it leaves both sources while open, e.g. a saved claim being un-starred here.
  const last = useRef(found);
  if (found) last.current = found;
  const claim = last.current;
  if (!claim) return <Text style={styles.missing}>Afirmação não encontrada.</Text>;
  const r = claim.result;
  const en = claim.language === "en";

  return (
    // "automatic" insets the content below the transparent Liquid Glass header on iOS 26.
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.body}>
      <ClaimActions claim={claim} />
      <Text style={styles.quote}>“{claim.quote}”</Text>
      <Text style={styles.claim}>{claim.claim}</Text>

      {r ? <VerdictBadge verdict={r.verdict} lang={claim.language} /> : <CheckingBadge />}
      {r && (
        <>
          <Text style={styles.muted}>
            {en ? VERDICT_INFO[r.verdict].definition : `Definição: ${VERDICT_INFO[r.verdict].definition}`}
          </Text>
          <View style={styles.stat}>
            <Text style={type.stat}>{Math.round(r.confidence * 100)}%</Text>
            <Text style={styles.label}>Confiança</Text>
          </View>
          <View style={[card, styles.analysis]}>
            <Text style={styles.summary}>{r.summary}</Text>
            <Text style={styles.explanation}>{r.explanation}</Text>
          </View>
          <Text style={[styles.label, styles.h]}>Fontes ({r.sources.length})</Text>
          {r.sources.length > 0 && (
            <View style={[card, styles.sources]}>
              {r.sources.map((s, i) => (
                <SourceRow key={s.url} s={s} first={i === 0} />
              ))}
            </View>
          )}
          <View style={styles.h}>
            <AiNotice />
          </View>
        </>
      )}
      {claim.status === "error" && <Text style={styles.error}>{claim.error}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { padding: space.md, paddingBottom: space.xxl, gap: space.sm },
  missing: { ...type.bodyMd, color: colors.muted, padding: 20 },
  quote: { ...type.titleLg, color: colors.onDark },
  claim: { ...type.bodyMd, color: colors.body },
  muted: { ...type.bodySm, color: colors.muted },
  stat: { flexDirection: "row", alignItems: "baseline", gap: 10, marginVertical: space.xs },
  label: { ...type.captionUpper, color: colors.muted },
  analysis: { padding: space.lg, gap: space.sm },
  summary: { ...type.titleMd, color: colors.onDark },
  explanation: { ...type.bodyMd, color: colors.body },
  h: { marginTop: space.sm },
  sources: { overflow: "hidden" },
  source: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
  },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline },
  pressed: { backgroundColor: colors.surfaceElevated },
  stance: { fontSize: 18, width: 22, textAlign: "center" },
  sourceTitle: { ...type.titleSm, fontSize: 15, color: colors.onDark },
  meta: { ...type.caption, color: colors.muted, marginTop: 2 },
  error: { ...type.bodySm, color: colors.danger },
});
