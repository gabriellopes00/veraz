import { VERDICT_INFO, type Verdict } from "@veraz/shared";
import { memo, useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { colors, continuous, radius, type } from "../theme";

export const verdictLabel = (v: Verdict, lang: string) => (lang === "en" ? VERDICT_INFO[v].en : VERDICT_INFO[v].pt);

export const VerdictBadge = memo(function VerdictBadge({ verdict, lang }: { verdict: Verdict; lang: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: VERDICT_INFO[verdict].color }]}>
      <Text style={[styles.text, { color: colors.onDark }]}>{verdictLabel(verdict, lang)}</Text>
    </View>
  );
});

/** "checking…" placeholder: a pulsing pill. */
export const CheckingBadge = memo(function CheckingBadge() {
  const opacity = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.35, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.View style={[styles.badge, { backgroundColor: colors.surfaceElevated, opacity }]}>
      <Text style={[styles.text, { color: colors.body }]}>verificando…</Text>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  badge: {
    ...continuous,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
  },
  text: { ...type.captionUpper, fontSize: 11, lineHeight: 15, letterSpacing: 1 },
});
