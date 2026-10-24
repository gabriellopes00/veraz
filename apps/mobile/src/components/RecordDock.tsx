import { useEffect, useState } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, {
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { onLevel } from "../audio";
import { colors, IOS, radius, space, type } from "../theme";
import { ActionButton, Surface } from "./Glass";

const MARGIN = space.md;
const PAD = space.md;
const BUTTON_H = IOS ? 56 : 48;
const TIME_H = 22;
const WAVE_H = 52;
const BAR_W = 3;
const BAR_GAP = 2;
const COLLAPSED_W = 168;
const COLLAPSED_H = BUTTON_H + PAD * 2;
const EXPANDED_H = PAD + TIME_H + space.sm + WAVE_H + space.md + BUTTON_H + PAD;

/** Height the dock covers at the bottom of the list. */
export const dockInset = (recording: boolean) => (recording ? EXPANDED_H : COLLAPSED_H) + space.xs;

const pad2 = (n: number) => String(n).padStart(2, "0");

function Elapsed({ recording }: { recording: boolean }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!recording) return; // keep the last value on screen while the box collapses
    const t0 = Date.now();
    setSecs(0);
    const id = setInterval(() => setSecs(Math.floor((Date.now() - t0) / 1000)), 250);
    return () => clearInterval(id);
  }, [recording]);
  return <Text style={styles.time}>{`${Math.floor(secs / 60)}:${pad2(secs % 60)}`}</Text>;
}

/** How long one bar covers. The tape scrolls one pitch per slot, so this sets the scroll speed (~60 px/s). */
const SLOT_MS = 80;
const PITCH = BAR_W + BAR_GAP;
const AnimatedPath = Animated.createAnimatedComponent(Path);

/** Shortest tick, drawn for silence so the tape never goes blank. */
const MIN_H = 2;

/**
 * Levels are -50..0 dBFS mapped to 0..1. Below about -39 dBFS is room noise and stays a tick; normal speech
 * (-30..-12 dBFS) is stretched across the whole height so talking and silence read clearly apart.
 */
const shape = (l: number) => {
  "worklet";
  return Math.min(1, Math.max(0, (l - 0.22) / 0.53));
};

/**
 * Voice-Memos-style tape: recent levels scroll left out of the playhead, the dotted track on its right feeds in.
 * Everything runs on the UI thread: mic levels only set a target, and a frame callback follows it with an envelope,
 * cuts it into fixed slots and scrolls them at a constant speed, so bursty audio buffers never show as jumps.
 */
function Waveform({ width, recording }: { width: number; recording: boolean }) {
  const head = Math.round(width * 0.62);
  const count = Math.ceil(head / PITCH) + 1;
  const mid = WAVE_H / 2;

  const target = useSharedValue(0);
  const env = useSharedValue(0);
  const peak = useSharedValue(0);
  const phase = useSharedValue(0); // 0..1 through the current slot
  const bars = useSharedValue<number[]>(Array(count).fill(0));

  useEffect(() => onLevel((l) => (target.value = l)), [target]);

  const frame = useFrameCallback(({ timeSincePreviousFrame: dt }) => {
    if (dt == null) return;
    // Fast attack, short release, frame-rate independent: smooth enough to drop buffer jitter, quick enough that
    // neighbouring bars still differ like syllables do.
    const k = 1 - Math.exp(-dt / (target.value > env.value ? 12 : 45));
    env.value += (target.value - env.value) * k;
    peak.value = Math.max(peak.value, env.value);
    let p = phase.value + dt / SLOT_MS;
    if (p >= 1) {
      p %= 1;
      bars.value = [...bars.value.slice(1), shape(peak.value)];
      peak.value = env.value;
    }
    phase.value = p;
  }, false);

  useEffect(() => {
    if (recording) {
      bars.value = Array(count).fill(0);
      target.value = env.value = peak.value = phase.value = 0;
    }
    frame.setActive(recording);
  }, [recording, count, frame, bars, target, env, peak, phase]);

  const barProps = useAnimatedProps(() => {
    const b = bars.value;
    const p = phase.value;
    let d = "";
    for (let i = 0; i < b.length; i++) {
      const age = b.length - 1 - i;
      const x = head - 4 - (age + p) * PITCH;
      if (x < -BAR_W) continue;
      // The newest bar grows out of the playhead during its slot instead of popping in.
      const h = (MIN_H + b[i]! * (WAVE_H - BAR_W - MIN_H)) * (age === 0 ? Math.min(1, p * 2.5) : 1);
      d += `M${x.toFixed(1)} ${(mid - h / 2).toFixed(1)}V${(mid + h / 2 + 0.01).toFixed(1)}`;
    }
    return { d: d || "M0 0" };
  });

  const dotProps = useAnimatedProps(() => {
    let d = "";
    for (let x = head + 4 + (1 - phase.value) * PITCH; x < width - 1; x += PITCH) d += `M${x.toFixed(1)} ${mid}h0.01`;
    return { d: d || "M0 0" };
  });

  return (
    <View style={{ width, height: WAVE_H }}>
      <Svg width={width} height={WAVE_H}>
        <Defs>
          <LinearGradient id="fade" x1="0" x2={head} y1="0" y2="0" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={colors.onDark} stopOpacity="0" />
            <Stop offset="0.45" stopColor={colors.onDark} stopOpacity="0.9" />
            <Stop offset="1" stopColor={colors.onDark} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <AnimatedPath animatedProps={barProps} stroke="url(#fade)" strokeWidth={BAR_W} strokeLinecap="round" />
        <AnimatedPath animatedProps={dotProps} stroke={colors.mutedSoft} strokeWidth={2} strokeLinecap="round" />
      </Svg>
      <View style={[styles.playhead, { left: head - 1 }]} />
    </View>
  );
}

/** Close to UIKit's default spring: settles in about half a second with only a hint of overshoot. */
const SPRING = { duration: 500, dampingRatio: 0.85 };

export function RecordDock({ recording, onToggle }: { recording: boolean; onToggle: () => void }) {
  const fullW = useWindowDimensions().width - MARGIN * 2;
  const progress = useSharedValue(recording ? 1 : 0);
  useEffect(() => {
    progress.value = withSpring(recording ? 1 : 0, SPRING);
  }, [recording, progress]);

  const boxStyle = useAnimatedStyle(() => ({
    width: interpolate(progress.value, [0, 1], [COLLAPSED_W, fullW]),
    height: interpolate(progress.value, [0, 1], [COLLAPSED_H, EXPANDED_H]),
  }));
  const contentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.5, 1], [0, 1], "clamp"),
    transform: [{ translateY: interpolate(progress.value, [0, 1], [8, 0], "clamp") }],
  }));

  return (
    <View style={styles.dock} pointerEvents="box-none">
      <Animated.View style={[styles.box, boxStyle]} pointerEvents="box-none">
        <Surface visible={recording} style={styles.shell} pointerEvents="none" />
        <Animated.View style={[styles.content, contentStyle]} pointerEvents="none">
          <Elapsed recording={recording} />
          <Waveform width={fullW - PAD * 2} recording={recording} />
        </Animated.View>
        <ActionButton
          label={recording ? "Parar" : "Gravar"}
          icon={recording ? "stop.fill" : "mic.fill"}
          tone={recording ? "danger" : "primary"}
          size="large"
          onPress={onToggle}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: { position: "absolute", left: 0, right: 0, bottom: space.xs, alignItems: "center" },
  box: { justifyContent: "flex-end", alignItems: "center", paddingBottom: PAD },
  shell: { ...StyleSheet.absoluteFill, borderRadius: IOS ? 34 : radius.lg },
  content: {
    position: "absolute",
    top: PAD,
    left: PAD,
    right: PAD,
    alignItems: "center",
    gap: space.sm,
    overflow: "hidden",
  },
  time: { ...type.titleSm, height: TIME_H, color: colors.onDark, fontVariant: ["tabular-nums"] },
  playhead: { position: "absolute", top: 0, width: 2, height: WAVE_H, borderRadius: 1, backgroundColor: colors.danger },
});
