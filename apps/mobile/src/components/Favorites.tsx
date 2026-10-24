import { type Claim, VERDICT_INFO } from "@veraz/shared";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFavorites } from "../favorites";
import { card, colors, space, type } from "../theme";
import { StarIcon } from "./Icons";
import { verdictLabel } from "./VerdictBadge";

const TILE_W = 196;

function Tile({ claim }: { claim: Claim }) {
  const r = claim.result!;
  const info = VERDICT_INFO[r.verdict];
  const sources = r.sources.length;
  return (
    <Pressable
      onPress={() => router.push(`/claim/${claim.id}`)}
      style={({ pressed }) => [card, styles.tile, pressed && styles.pressed]}
    >
      <View style={styles.top}>
        <View style={[styles.verdict, { backgroundColor: info.color }]}>
          <Text style={styles.glyph}>{r.verdict === "TRUE" ? "✓" : r.verdict === "FALSE" ? "✕" : "!"}</Text>
        </View>
        <StarIcon size={18} color={colors.primary} filled />
      </View>
      <Text style={styles.quote} numberOfLines={3}>
        {claim.quote}
      </Text>
      <Text style={styles.meta} numberOfLines={1}>
        <Text style={{ color: info.color }}>{verdictLabel(r.verdict, claim.language)}</Text>
        {` · ${sources} ${sources === 1 ? "fonte" : "fontes"}`}
      </Text>
    </Pressable>
  );
}

/** Saved verified claims as a row of tiles that scrolls sideways. Hidden when nothing is saved. */
export function Favorites() {
  const favorites = useFavorites();
  if (favorites.length === 0) return null;
  return (
    <View>
      <Text style={styles.title}>Favoritos</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        snapToInterval={TILE_W + space.sm}
        decelerationRate="fast"
      >
        {favorites.map((c) => (
          <Tile key={c.id} claim={c} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    ...type.titleLg,
    color: colors.onDark,
    paddingHorizontal: space.md,
    marginTop: space.md,
    marginBottom: space.sm,
  },
  row: { paddingHorizontal: space.md, gap: space.sm },
  tile: { width: TILE_W, minHeight: 168, padding: space.md, gap: space.sm },
  pressed: { backgroundColor: colors.surfaceElevated },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: "auto" },
  verdict: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  glyph: { ...type.titleSm, color: colors.onDark },
  quote: { ...type.titleSm, color: colors.onDark },
  meta: { ...type.caption, color: colors.muted },
});
