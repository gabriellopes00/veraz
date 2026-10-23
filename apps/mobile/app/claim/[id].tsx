import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { VERDICT_INFO, type Source } from "@veraz/shared";
import { VerdictBadge, CheckingBadge } from "../../src/components/VerdictBadge";
import { useStore } from "../../src/store";
import { useTheme } from "../../src/theme";

const STANCE = {
  supports: { icon: "✓", color: "#16a34a", pt: "apoia" },
  refutes: { icon: "✗", color: "#dc2626", pt: "refuta" },
  context: { icon: "ℹ", color: "#6b7280", pt: "contexto" },
} as const;

function SourceRow({ s }: { s: Source }) {
  const t = useTheme();
  const st = STANCE[s.stance];
  return (
    <Pressable onPress={() => WebBrowser.openBrowserAsync(s.url)} style={[styles.source, { borderColor: t.border }]}>
      <Text style={{ color: st.color, fontSize: 20, width: 26 }}>{st.icon}</Text>
      <View style={styles.flex}>
        <Text style={{ color: t.text, fontWeight: "600" }} numberOfLines={2}>{s.title}</Text>
        <Text style={{ color: t.sub, fontSize: 12 }}>
          {s.outlet}
          {s.published_at ? ` · ${s.published_at}` : ""} · {st.pt}
        </Text>
      </View>
    </Pressable>
  );
}

export default function ClaimDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const claim = useStore((s) => s.claims[id]);
  const t = useTheme();
  if (!claim) return <Text style={{ color: t.sub, padding: 20 }}>Afirmação não encontrada.</Text>;
  const r = claim.result;
  const en = claim.language === "en";

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <Text style={[styles.quote, { color: t.text }]}>“{claim.quote}”</Text>
      <Text style={{ color: t.sub }}>{claim.claim}</Text>

      {r ? <VerdictBadge verdict={r.verdict} lang={claim.language} /> : <CheckingBadge color={t.sub} />}
      {r && (
        <>
          <Text style={{ color: t.sub }}>{en ? VERDICT_INFO[r.verdict].definition : `Definição: ${VERDICT_INFO[r.verdict].definition}`}</Text>
          <Text style={{ color: t.text, fontWeight: "600" }}>Confiança: {Math.round(r.confidence * 100)}%</Text>
          <Text style={[styles.summary, { color: t.text }]}>{r.summary}</Text>
          <Text style={{ color: t.text, lineHeight: 21 }}>{r.explanation}</Text>
          <Text style={[styles.h, { color: t.text }]}>Fontes ({r.sources.length})</Text>
          {r.sources.map((s) => <SourceRow key={s.url} s={s} />)}
        </>
      )}
      {claim.status === "error" && <Text style={{ color: t.danger }}>{claim.error}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { padding: 16, gap: 12 },
  quote: { fontSize: 20, fontWeight: "700", lineHeight: 27 },
  summary: { fontSize: 16, fontWeight: "600", lineHeight: 22 },
  h: { fontSize: 17, fontWeight: "700", marginTop: 8 },
  source: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
});
