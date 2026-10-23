import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import Svg, { Circle, G, Path, Polygon, Rect } from "react-native-svg";
import { colors, space, type } from "../theme";
import { ActionButton } from "./Glass";

const INK = "#0e110c"; // the mark's colour on the lime app icon

/** A conversation bubble whose middle line, the claim, is picked out and stamped with the Veraz mark. */
function Illustration() {
  return (
    <Svg width={200} height={150} viewBox="0 0 200 150">
      <Circle cx={100} cy={80} r={64} fill={colors.surfaceSoft} />
      {/* the other side of the conversation */}
      <Rect x={96} y={20} width={80} height={44} rx={14} fill={colors.surfaceCard} stroke={colors.hairlineStrong} strokeWidth={1.5} />
      <Path d="M156 64 L162 74 L146 64" fill={colors.surfaceCard} stroke={colors.hairlineStrong} strokeWidth={1.5} strokeLinejoin="round" />
      <Path d="M110 36 H160 M110 48 H142" stroke={colors.hairlineStrong} strokeWidth={5} strokeLinecap="round" />
      {/* the bubble with the claim */}
      <Path
        d="M40 52 H124 Q138 52 138 66 V98 Q138 112 124 112 H58 L42 124 L44 112 H40 Q26 112 26 98 V66 Q26 52 40 52 Z"
        fill={colors.surfaceElevated}
        stroke={colors.mutedSoft}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <Path d="M42 70 H110" stroke={colors.mutedSoft} strokeWidth={5} strokeLinecap="round" />
      <Path d="M42 83 H122" stroke={colors.primary} strokeWidth={5} strokeLinecap="round" />
      <Path d="M42 96 H86" stroke={colors.mutedSoft} strokeWidth={5} strokeLinecap="round" />
      {/* verified stamp: the app icon */}
      <Circle cx={138} cy={110} r={20} fill={colors.primary} stroke={colors.canvas} strokeWidth={4} />
      <G transform="translate(126 98) scale(0.2)" fill={INK}>
        <Polygon points="6,44 30,44 52.9,74.5 44.2,95" />
        <Polygon points="46,112 70,112 114,8 90,8" />
      </G>
      {/* sparkles */}
      <Path d="M174 92 v12 M168 98 h12" stroke={colors.primary} strokeWidth={2} strokeLinecap="round" />
      <Path d="M28 28 v10 M23 33 h10" stroke={colors.mutedSoft} strokeWidth={2} strokeLinecap="round" />
      <Circle cx={68} cy={30} r={2.5} fill={colors.mutedSoft} />
      <Circle cx={176} cy={128} r={2} fill={colors.mutedSoft} />
    </Svg>
  );
}

/** Shown in place of the claim list before anything has been identified. */
export function EmptyClaims({ live, onType }: { live: boolean; onType: () => void }) {
  return (
    <Animated.View entering={FadeIn.duration(300)} style={styles.wrap}>
      <Illustration />
      <Text style={styles.title}>{live ? "Ouvindo a conversa" : "Nenhuma afirmação ainda"}</Text>
      <Text style={styles.body}>
        {live
          ? "As afirmações aparecem aqui assim que forem identificadas."
          : "Comece a gravar uma conversa e o Veraz identifica e verifica as afirmações em tempo real."}
      </Text>
      {/* During a conversation the transcript itself is the place to tap and type. */}
      {!live && (
        <View style={styles.action}>
          <ActionButton label="Digitar afirmação" icon="keyboard" tone="secondary" size="small" onPress={onType} />
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", paddingHorizontal: space.xl, paddingTop: space.lg },
  title: { ...type.titleMd, color: colors.onDark, marginTop: space.md, textAlign: "center" },
  body: { ...type.bodySm, color: colors.muted, marginTop: space.xs, textAlign: "center", maxWidth: 300 },
  action: { marginTop: space.md },
});
