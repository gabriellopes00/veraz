import { memo, useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { VERDICT_INFO, type Verdict } from "@veraz/shared";

export const verdictLabel = (v: Verdict, lang: string) => (lang === "en" ? VERDICT_INFO[v].en : VERDICT_INFO[v].pt);

export const VerdictBadge = memo(function VerdictBadge({ verdict, lang }: { verdict: Verdict; lang: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: VERDICT_INFO[verdict].color }]}>
      <Text style={styles.text}>{verdictLabel(verdict, lang)}</Text>
    </View>
  );
});

/** "checking…" placeholder: a pulsing pill. */
export const CheckingBadge = memo(function CheckingBadge({ color }: { color: string }) {
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
    <Animated.View style={[styles.badge, { backgroundColor: color, opacity }]}>
      <Text style={styles.text}>verificando…</Text>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: "flex-start" },
  text: { color: "#fff", fontWeight: "700", fontSize: 12 },
});
