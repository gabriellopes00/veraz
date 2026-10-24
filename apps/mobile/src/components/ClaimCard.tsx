import type { Claim } from "@veraz/shared";
import { router } from "expo-router";
import { memo, type ReactNode, useEffect, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import ReanimatedSwipeable, { type SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import Animated, { interpolate, type SharedValue, useAnimatedStyle } from "react-native-reanimated";
import { toggleFavorite, useIsFavorite } from "../favorites";
import { useStore } from "../store";
import { card, colors, continuous, space, type } from "../theme";
import { RecheckIcon, StarIcon, TrashIcon } from "./Icons";
import { CheckingBadge, VerdictBadge } from "./VerdictBadge";

const ACTION_W = 68;

/** Only one row stays open at a time, as in Mail, WhatsApp and Telegram. */
let openRow: SwipeableMethods | null = null;

function Action({
  label,
  bg,
  onPress,
  children,
}: {
  label: string;
  bg: string;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={[styles.circle, { backgroundColor: bg }]}>{children}</View>
      <Text style={styles.actionLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Revealed behind the card as it slides left; the buttons grow in with the swipe. */
function Actions({ claim, progress, row }: { claim: Claim; progress: SharedValue<number>; row: SwipeableMethods }) {
  const favorite = useIsFavorite(claim.id);
  const settled = claim.status === "verified" || claim.status === "error";
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.2, 0.8], [0, 1], "clamp"),
    transform: [{ scale: interpolate(progress.value, [0, 1], [0.6, 1], "clamp") }],
  }));

  return (
    <Animated.View style={[styles.actions, style]}>
      {settled && (
        // MOCK: will ask the API to check the claim again; for now it only closes the row.
        <Action label="Revisar" bg={colors.surfaceElevated} onPress={() => row.close()}>
          <RecheckIcon color={colors.onDark} />
        </Action>
      )}
      {claim.status === "verified" && (
        <Action
          label={favorite ? "Remover" : "Favoritar"}
          bg={colors.primary}
          onPress={() => {
            toggleFavorite(claim);
            row.close();
          }}
        >
          <StarIcon color={colors.onPrimary} filled={!favorite} />
        </Action>
      )}
      <Action
        label="Excluir"
        bg={colors.danger}
        onPress={() => useStore.getState().apply({ type: "claim.removed", id: claim.id })}
      >
        <TrashIcon color={colors.onDark} />
      </Action>
    </Animated.View>
  );
}

/** Subscribes to its own claim only, so a single update re-renders a single card. Swipe left for its actions. */
export const ClaimCard = memo(function ClaimCard({ id }: { id: string }) {
  const claim = useStore((s) => s.claims[id]);
  const favorite = useIsFavorite(id);
  const row = useRef<SwipeableMethods>(null);
  // FlashList recycles cells: a row reused for another claim must not arrive swiped open.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `id` is the trigger; the cell is reused for a new claim.
  useEffect(() => () => row.current?.reset(), [id]);
  if (!claim) return null;
  const sources = claim.result?.sources.length ?? 0;

  return (
    <ReanimatedSwipeable
      ref={row}
      friction={1.6}
      rightThreshold={ACTION_W}
      overshootRight={false}
      onSwipeableWillOpen={() => {
        if (openRow && openRow !== row.current) openRow.close();
        openRow = row.current;
      }}
      renderRightActions={(progress, _drag, methods) => <Actions claim={claim} progress={progress} row={methods} />}
    >
      <Pressable
        onPress={() => router.push(`/claim/${id}`)}
        style={({ pressed }) => [card, styles.card, pressed && styles.pressed]}
      >
        <Text style={styles.quote} numberOfLines={3}>
          “{claim.quote}”
        </Text>
        <View style={styles.row}>
          {claim.status === "verified" && claim.result ? (
            <VerdictBadge verdict={claim.result.verdict} lang={claim.language} />
          ) : claim.status === "error" ? (
            <Text style={styles.error}>Erro na verificação</Text>
          ) : (
            <CheckingBadge />
          )}
          <View style={styles.metaRow}>
            {favorite && <StarIcon size={14} color={colors.primary} filled />}
            <Text style={styles.meta}>
              {claim.status === "verified" ? `${sources} ${sources === 1 ? "fonte" : "fontes"}` : claim.category}
              {claim.cached ? " · cache" : ""}
            </Text>
          </View>
        </View>
        {claim.result && (
          <Text style={styles.summary} numberOfLines={2}>
            {claim.result.summary}
          </Text>
        )}
      </Pressable>
    </ReanimatedSwipeable>
  );
});

const styles = StyleSheet.create({
  card: { marginHorizontal: space.md, marginVertical: 6, padding: space.md, gap: 10 },
  pressed: { backgroundColor: colors.surfaceElevated },
  quote: { ...type.titleSm, color: colors.onDark },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  error: { ...type.caption, color: colors.danger },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  meta: { ...type.caption, color: colors.muted },
  summary: { ...type.bodySm, color: colors.body },
  actions: { flexDirection: "row", alignItems: "center", paddingRight: space.sm },
  action: { width: ACTION_W, alignItems: "center", gap: 6 },
  actionPressed: { opacity: 0.7 },
  circle: { ...continuous, width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  actionLabel: { ...type.caption, fontSize: 12, color: colors.body },
});
