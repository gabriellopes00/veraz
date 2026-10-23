import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useStore } from "../store";
import { useTheme } from "../theme";
import { CheckingBadge, VerdictBadge } from "./VerdictBadge";

/** Subscribes to its own claim only, so a single update re-renders a single card. */
export const ClaimCard = memo(function ClaimCard({ id }: { id: string }) {
  const claim = useStore((s) => s.claims[id]);
  const t = useTheme();
  if (!claim) return null;
  const sources = claim.result?.sources.length ?? 0;

  return (
    <Pressable
      onPress={() => router.push(`/claim/${id}`)}
      style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}
    >
      <Text style={[styles.quote, { color: t.text }]} numberOfLines={3}>
        “{claim.quote}”
      </Text>
      <View style={styles.row}>
        {claim.status === "verified" && claim.result ? (
          <VerdictBadge verdict={claim.result.verdict} lang={claim.language} />
        ) : claim.status === "error" ? (
          <Text style={{ color: t.danger, fontWeight: "600" }}>Erro na verificação</Text>
        ) : (
          <CheckingBadge color={t.sub} />
        )}
        <Text style={{ color: t.sub, fontSize: 12 }}>
          {claim.status === "verified" ? `${sources} ${sources === 1 ? "fonte" : "fontes"}` : claim.category}
          {claim.cached ? " · cache" : ""}
        </Text>
      </View>
      {claim.result && (
        <Text style={{ color: t.sub, fontSize: 13 }} numberOfLines={2}>
          {claim.result.summary}
        </Text>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: { marginHorizontal: 12, marginVertical: 5, padding: 14, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, gap: 8 },
  quote: { fontSize: 15, fontWeight: "500", lineHeight: 21 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
});
