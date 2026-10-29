import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { API_URL } from "../config";
import { card, colors, space, type } from "../theme";
import { ActionButton } from "./Glass";
import { CloseIcon, OfflineIcon } from "./Icons";

/** The API's address without the scheme: on the LAN it is what tells a wrong IP from a stopped server. */
const API_HOST = API_URL.replace(/^https?:\/\//, "");

/**
 * The API could not be reached. Laid out like the AI notice: icon on the left, then what failed, the likely causes,
 * the address it tried and a retry. The button turns into a spinner while retrying.
 */
export function ServerError({
  title,
  retrying,
  onRetry,
  onDismiss,
  style,
}: {
  /** What did not happen, e.g. "Não foi possível começar a gravar". */
  title: string;
  retrying: boolean;
  onRetry: () => void;
  /** Adds a close button. */
  onDismiss?: () => void;
  style?: ViewStyle;
}) {
  return (
    <View style={[card, styles.box, style]}>
      <OfflineIcon size={20} color={colors.warning} />
      <View style={styles.text}>
        <Text style={[styles.title, onDismiss && styles.titleBesideClose]}>{title}</Text>
        <Text style={styles.body}>
          O servidor do Veraz não respondeu. Confira se ele está rodando e se o celular está na mesma rede.
        </Text>
        <Text style={styles.host}>{API_HOST}</Text>
        <View style={styles.retry}>
          {retrying ? (
            <ActivityIndicator color={colors.muted} accessibilityLabel="Tentando de novo" />
          ) : (
            <ActionButton
              label="Tentar de novo"
              icon="arrow.clockwise"
              tone="secondary"
              size="small"
              onPress={onRetry}
            />
          )}
        </View>
      </View>
      {onDismiss && (
        <Pressable
          onPress={onDismiss}
          hitSlop={10}
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Fechar"
        >
          <CloseIcon size={18} color={colors.muted} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: "row", gap: space.sm, padding: space.md, marginHorizontal: space.md },
  text: { flex: 1, gap: space.xxs },
  title: { ...type.titleSm, fontSize: 15, color: colors.onDark },
  titleBesideClose: { paddingRight: space.lg },
  body: { ...type.bodySm, color: colors.body },
  host: { ...type.caption, color: colors.muted },
  // Holds the button's height while the spinner shows, so the card does not jump.
  retry: { marginTop: space.xs, minHeight: 36, alignItems: "flex-start", justifyContent: "center" },
  close: { position: "absolute", top: space.sm, right: space.sm, padding: space.xxs },
  pressed: { opacity: 0.6 },
});
