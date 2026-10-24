import type { Claim } from "@veraz/shared";
import { router, Stack } from "expo-router";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { confirmDeleteClaim } from "../confirm";
import { toggleFavorite, useIsFavorite } from "../favorites";
import { colors, IOS } from "../theme";
import { MoreIcon, StarIcon } from "./Icons";

// MOCK: will ask the API to check the claim again, like the card's "Revisar" swipe action.
const recheck = () => {};

/** Once the deletion is confirmed, the screen closes. */
const askDelete = (claim: Claim) => confirmDeleteClaim(claim.id, () => router.back());

/**
 * Header actions of the claim screen: a star to favourite and a "more" menu with favourite, review and delete.
 * iOS uses native bar items, which iOS 26 joins into one Liquid Glass capsule. Android's header toolbar only draws
 * bundled images, so it gets the drawn icons and a system dialog for the menu.
 */
export function ClaimActions({ claim }: { claim: Claim }) {
  const favorite = useIsFavorite(claim.id);
  const verified = claim.status === "verified";
  const settled = verified || claim.status === "error";
  const favoriteLabel = favorite ? "Remover dos favoritos" : "Favoritar";

  if (IOS)
    return (
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon={favorite ? "star.fill" : "star"}
          tintColor={favorite ? colors.primary : undefined}
          hidden={!verified}
          onPress={() => toggleFavorite(claim)}
          accessibilityLabel={favoriteLabel}
        />
        <Stack.Toolbar.Menu icon="ellipsis" accessibilityLabel="Mais ações">
          <Stack.Toolbar.MenuAction
            icon={favorite ? "star.slash" : "star"}
            hidden={!verified}
            onPress={() => toggleFavorite(claim)}
          >
            {favoriteLabel}
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction icon="arrow.clockwise" hidden={!settled} onPress={recheck}>
            Revisar
          </Stack.Toolbar.MenuAction>
          {/* An inline section, so a separator sets delete apart as in the system apps. */}
          <Stack.Toolbar.Menu inline>
            <Stack.Toolbar.MenuAction icon="trash" destructive onPress={() => askDelete(claim)}>
              Excluir
            </Stack.Toolbar.MenuAction>
          </Stack.Toolbar.Menu>
        </Stack.Toolbar.Menu>
      </Stack.Toolbar>
    );

  const more = () =>
    Alert.alert(
      "Afirmação",
      undefined,
      [
        ...(verified ? [{ text: favoriteLabel, onPress: () => toggleFavorite(claim) }] : []),
        ...(settled ? [{ text: "Revisar", onPress: recheck }] : []),
        { text: "Excluir", style: "destructive" as const, onPress: () => askDelete(claim) },
      ],
      { cancelable: true },
    );

  return (
    <Stack.Screen
      options={{
        headerRight: () => (
          <View style={styles.row}>
            {verified && (
              <Pressable
                onPress={() => toggleFavorite(claim)}
                hitSlop={10}
                style={({ pressed }) => [styles.button, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={favoriteLabel}
              >
                <StarIcon color={favorite ? colors.primary : colors.onDark} filled={favorite} />
              </Pressable>
            )}
            <Pressable
              onPress={more}
              hitSlop={10}
              style={({ pressed }) => [styles.button, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Mais ações"
            >
              <MoreIcon color={colors.onDark} />
            </Pressable>
          </View>
        ),
      }}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
  button: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.6 },
});
