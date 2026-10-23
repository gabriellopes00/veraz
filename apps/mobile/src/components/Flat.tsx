import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, continuous, radius, type } from "../theme";
import type { ActionButtonProps, SurfaceGroupProps, SurfaceProps } from "./Glass.types";

/** design.md surfaces and buttons, used on Android and as the fallback where Liquid Glass is unavailable. */
export function Surface({ tint, interactive: _, visible = true, style, ...props }: SurfaceProps) {
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(opacity, { toValue: visible ? 1 : 0, duration: 200, useNativeDriver: true }).start();
  }, [visible, opacity]);
  return <Animated.View style={[styles.surface, tint ? { backgroundColor: tint } : null, style, { opacity }]} {...props} />;
}

export function SurfaceGroup({ spacing: _, ...props }: SurfaceGroupProps) {
  return <View {...props} />;
}

const TONE = {
  primary: { bg: colors.primary, pressed: colors.primaryActive, fg: colors.onPrimary },
  secondary: { bg: colors.surfaceCard, pressed: colors.surfaceElevated, fg: colors.onDark },
  danger: { bg: colors.danger, pressed: "#dc2626", fg: colors.onDark },
} as const;

export function ActionButton({ label, tone = "primary", size = "medium", onPress }: ActionButtonProps) {
  const t = TONE[tone];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        size !== "medium" && styles[size],
        tone === "secondary" && styles.outlined,
        { backgroundColor: pressed ? t.pressed : t.bg },
      ]}
    >
      <Text style={[type.button, size === "mini" && styles.miniLabel, { color: t.fg }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  surface: { ...continuous, backgroundColor: colors.surfaceCard, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairline },
  button: { ...continuous, height: 40, paddingHorizontal: 20, borderRadius: radius.md, justifyContent: "center", alignItems: "center" },
  mini: { height: 30, paddingHorizontal: 12, borderRadius: radius.sm },
  miniLabel: { fontSize: 13 },
  small: { height: 36, paddingHorizontal: 14 },
  large: { height: 48, paddingHorizontal: 28 },
  outlined: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairlineStrong },
});
