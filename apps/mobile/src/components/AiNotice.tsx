import { StyleSheet, Text, View } from "react-native";
import { card, colors, space, type } from "../theme";
import { WarningIcon } from "./Icons";

/** Reminds the reader that verdicts come from AI and should be double-checked against the sources. */
export function AiNotice() {
  return (
    <View style={[card, styles.box]}>
      <WarningIcon size={20} color={colors.warning} />
      <View style={styles.text}>
        <Text style={styles.title}>Verificado por inteligência artificial</Text>
        <Text style={styles.body}>
          Os vereditos são gerados por IA e podem conter erros. Confira as fontes antes de compartilhar ou de tirar
          conclusões.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: "row", gap: space.sm, padding: space.md },
  text: { flex: 1, gap: space.xxs },
  title: { ...type.titleSm, fontSize: 15, color: colors.onDark },
  body: { ...type.bodySm, color: colors.body },
});
