import { type Claim, VERDICT_INFO } from "@veraz/shared";
import { Link } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, Alert, AppState, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { confirmDeleteClaim } from "../confirm";
import { ensureFavorites, loadFavorites, useFavorites, useFavoritesStatus, useIsRechecking } from "../favorites";
import { recheckClaim } from "../recheck";
import { useStore } from "../store";
import { card, colors, continuous, IOS, radius, space, type } from "../theme";
import { StarIcon } from "./Icons";
import { ServerError } from "./ServerError";
import { verdictLabel } from "./VerdictBadge";

const TILE_W = 196;

const askDelete = (claim: Claim) => confirmDeleteClaim(claim.id);

/** Android has no native context menu, so a long press opens a system dialog with the same actions. */
const androidMenu = (claim: Claim) =>
  Alert.alert(
    "Afirmação",
    undefined,
    [
      { text: "Revisar", onPress: () => recheckClaim(claim.id) },
      { text: "Excluir", style: "destructive", onPress: () => askDelete(claim) },
    ],
    { cancelable: true },
  );

/**
 * Tap opens the claim; press and hold opens the same actions as the claim screen's "more" menu. On iOS that is the
 * native context menu, which lifts the tile and draws the menu in Liquid Glass on iOS 26.
 * While rechecked, it keeps the old verdict and spins in place of the badge.
 */
function Tile({ claim }: { claim: Claim }) {
  const rechecking = useIsRechecking(claim.id);
  const r = claim.result!;
  const info = VERDICT_INFO[r.verdict];
  const sources = r.sources.length;
  return (
    <Link href={`/claim/${claim.id}`} asChild>
      <Link.Trigger>
        {/* Link's Slot merges `style` as a plain object, which drops a style function, so the card look and its
            pressed state live on the inner view. The radius here keeps the lifted tile's corners. */}
        <Pressable onLongPress={IOS || rechecking ? undefined : () => androidMenu(claim)} style={styles.hit}>
          {({ pressed }) => (
            <View style={[card, styles.tile, pressed && styles.pressed]}>
              <View style={styles.top}>
                {rechecking ? (
                  <View style={[styles.verdict, styles.checking]}>
                    <ActivityIndicator color={colors.onDark} accessibilityLabel="Revisando" />
                  </View>
                ) : (
                  <View style={[styles.verdict, { backgroundColor: info.color }]}>
                    <Text style={styles.glyph}>{r.verdict === "TRUE" ? "✓" : r.verdict === "FALSE" ? "✕" : "!"}</Text>
                  </View>
                )}
                <StarIcon size={18} color={colors.primary} filled />
              </View>
              <Text style={styles.quote} numberOfLines={3}>
                {claim.quote}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                <Text style={{ color: info.color }}>{verdictLabel(r.verdict, claim.language)}</Text>
                {` · ${sources} ${sources === 1 ? "fonte" : "fontes"}`}
              </Text>
            </View>
          )}
        </Pressable>
      </Link.Trigger>
      <Link.Menu>
        <Link.MenuAction icon="arrow.clockwise" hidden={rechecking} onPress={() => recheckClaim(claim.id)}>
          Revisar
        </Link.MenuAction>
        {/* An inline section, so a separator sets delete apart as in the system apps. */}
        <Link.Menu inline>
          <Link.MenuAction icon="trash" destructive onPress={() => askDelete(claim)}>
            Excluir
          </Link.MenuAction>
        </Link.Menu>
      </Link.Menu>
    </Link>
  );
}

/**
 * Saved verified claims as a row of tiles that scrolls sideways. Hidden when nothing is saved; an error card when
 * they could not be loaded. Loads when first shown, and tries again whenever it comes back into view: after a
 * conversation ends or when the app returns from the background.
 */
export function Favorites() {
  const favorites = useFavorites();
  const status = useFavoritesStatus();
  // The screen already says the API is unreachable; a second card would only repeat it.
  const offline = useStore((s) => s.offline !== null);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => s === "active" && ensureFavorites());
    return () => sub.remove();
  }, []);
  // On mount, and again once the API answers after being unreachable.
  useEffect(() => {
    if (!offline) ensureFavorites();
  }, [offline]);

  if (status === "failed" || status === "retrying") {
    if (offline) return null;
    return (
      <View>
        <Text style={styles.title}>Favoritos</Text>
        <ServerError
          title="Não foi possível carregar os favoritos"
          retrying={status === "retrying"}
          onRetry={() => void loadFavorites()}
        />
      </View>
    );
  }
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
  // Grows like the tile did when it was the row's direct child, so tiles in a row keep one height.
  hit: { ...continuous, borderRadius: radius.lg, flexGrow: 1 },
  tile: { flexGrow: 1, width: TILE_W, minHeight: 168, padding: space.md, gap: space.sm },
  pressed: { backgroundColor: colors.surfaceElevated },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: "auto" },
  verdict: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  checking: { backgroundColor: colors.surfaceElevated },
  glyph: { ...type.titleSm, color: colors.onDark },
  quote: { ...type.titleSm, color: colors.onDark },
  meta: { ...type.caption, color: colors.muted },
});
