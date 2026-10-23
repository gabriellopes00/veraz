import { StyleSheet, Text, View } from "react-native";
import Svg, { Polygon } from "react-native-svg";
import { colors } from "../theme";

/** The Veraz mark: a check whose long stroke runs past the box. Geometry from the Claude Design "Veraz Logo". */
export function LogoMark({ size, color = colors.primary }: { size: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" accessibilityLabel="Veraz">
      <Polygon points="6,44 30,44 52.9,74.5 44.2,95" fill={color} />
      <Polygon points="46,112 70,112 114,8 90,8" fill={color} />
    </Svg>
  );
}

/** Primary lockup: mark + lowercase wordmark in Outfit, proportioned like the design (mark ≈ 0.91× the type size). */
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <View style={[styles.row, { gap: size * 0.2 }]} accessible accessibilityRole="header" accessibilityLabel="Veraz">
      <LogoMark size={size * 0.91} />
      <Text style={[styles.word, { fontSize: size, lineHeight: size * 1.15, letterSpacing: size * -0.03 }]}>veraz</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  word: { fontFamily: "Outfit_700Bold", color: colors.onDark },
});
