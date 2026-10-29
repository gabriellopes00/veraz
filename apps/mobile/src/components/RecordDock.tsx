import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { LEVEL_MS, onLevel } from "../audio";
import { colors, IOS, radius, space, type } from "../theme";
import { ActionButton, ConfirmButton, Surface } from "./Glass";
import { TrashIcon } from "./Icons";

const MARGIN = space.md;
const PAD = space.md;
const BUTTON_H = IOS ? 56 : 48;
/** The trash button next to Gravar: a step down from it, so recording stays the main action. */
const CLEAR_D = IOS ? 46 : 40;
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

/** How long one bar covers: one mic level per slot, so the tape scrolls one pitch per level (~70 px/s). */
const SLOT_MS = LEVEL_MS;
const PITCH = BAR_W + BAR_GAP;
const AnimatedPath = Animated.createAnimatedComponent(Path);

/** Shortest bar: silence draws as a dot (the round cap), like the dotted track ahead of the playhead. */
const MIN_H = 0;
/** Levels waiting for their slot. Buffers arrive in bursts; a short queue lets them leave at an even pace. */
const QUEUE_TARGET = 2;
const QUEUE_MAX = 8;
/** Narrowest range between noise floor and ceiling, in dB, so a silent room is never stretched into full bars. */
const MIN_SPAN = 14;
/** How far above the noise floor, in dB, a sound must be to rise from a dot. */
const GATE = 6;

/**
 * Voice-Memos-style tape: recent levels scroll left out of the playhead, the dotted track on its right feeds in.
 * Each mic level (one per LEVEL_MS of audio) becomes exactly one bar, so neighbouring syllables keep their own
 * heights. JS only publishes levels with a running count; a frame callback on the UI thread takes them at a constant
 * speed, so bursty audio buffers never show as jumps.
 */
function Waveform({ width, recording }: { width: number; recording: boolean }) {
  const head = Math.round(width * 0.62);
  const count = Math.ceil(head / PITCH) + 1;
  const mid = WAVE_H / 2;

  // Written only by JS: how many levels so far and the last few. The UI thread only reads it, so nothing races.
  // Each write is a fresh object: whatever reaches a worklet gets frozen, so it can never be updated in place.
  const feed = useSharedValue({ n: 0, recent: [] as number[] });
  const fedN = useRef(0);
  const fedRecent = useRef<number[]>([]);
  const taken = useSharedValue(0); // levels turned into bars
  const floor = useSharedValue(1); // noise floor in dBFS, 1 (above full scale) until the first level
  const ceil = useSharedValue(-100);
  const phase = useSharedValue(0); // 0..1 through the current slot
  const bars = useSharedValue<number[]>(Array(count).fill(0));

  useEffect(
    () =>
      onLevel((l) => {
        fedN.current += 1;
        fedRecent.current = [...fedRecent.current.slice(1 - QUEUE_MAX), l];
        feed.value = { n: fedN.current, recent: fedRecent.current };
      }),
    [feed],
  );

  /**
   * Bar height 0..1 relative to what this mic hears right now. The floor follows quiet stretches down fast and up
   * slowly; the ceiling jumps to peaks and decays ~2 dB/s. A fixed dB scale fails both ways: a hot mic pins every
   * syllable at full height, a quiet one leaves speech as ticks. The gentle curve keeps loud and soft syllables apart.
   */
  const height = (db: number) => {
    "worklet";
    const f = floor.value > 0 ? db : floor.value;
    floor.value = f + (db - f) * (db < f ? 0.5 : 0.005);
    ceil.value = Math.max(db, ceil.value - 0.15, floor.value + MIN_SPAN);
    const v = (db - floor.value - GATE) / (ceil.value - floor.value - GATE);
    return Math.min(1, Math.max(0, v)) ** 1.3;
  };

  const frame = useFrameCallback(({ timeSincePreviousFrame: dt }) => {
    if (dt == null) return;
    const { n, recent } = feed.value;
    let behind = n - taken.value;
    if (behind > QUEUE_MAX) {
      taken.value = n - QUEUE_TARGET; // the JS thread stalled: skip ahead rather than lag behind the voice
      behind = QUEUE_TARGET;
    }
    // The audio clock and the display clock drift apart: run slightly faster while levels pile up, slower when short.
    const rate = 1 + Math.min(0.5, Math.max(-0.3, (behind - QUEUE_TARGET) * 0.15));
    let p = phase.value + (dt / SLOT_MS) * rate;
    if (p >= 1) {
      p %= 1;
      const b = bars.value;
      // Starved (a late buffer): let the last bar trail off rather than stall the scroll.
      const next = behind > 0 ? height(recent[recent.length - behind]!) : b[b.length - 1]! * 0.5;
      if (behind > 0) taken.value += 1;
      bars.value = [...b.slice(1), next];
    }
    phase.value = p;
  }, false);

  useEffect(() => {
    if (recording) {
      fedN.current = 0;
      fedRecent.current = [];
      feed.value = { n: 0, recent: [] };
      bars.value = Array(count).fill(0);
      floor.value = 1;
      ceil.value = -100;
      phase.value = taken.value = 0;
    }
    frame.setActive(recording);
  }, [recording, count, frame, feed, bars, floor, ceil, phase, taken]);

  // Reads `bars` and `phase` here, not in a helper: an animated worklet only re-runs for shared values it reads itself.
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

const CLEAR_CONFIRM = {
  title: "Limpar a conversa?",
  message: "As afirmações e a transcrição desta conversa serão apagadas. Os favoritos continuam salvos.",
  action: "Limpar",
};

/** Red round button that ends the conversation and clears its claims, once confirmed. */
function ClearButton({ onPress }: { onPress: () => void }) {
  return (
    <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)}>
      <ConfirmButton
        icon="trash"
        fallbackIcon={<TrashIcon size={IOS ? 22 : 20} color={colors.onDark} />}
        label="Limpar"
        size={CLEAR_D}
        confirm={CLEAR_CONFIRM}
        onConfirm={onPress}
      />
    </Animated.View>
  );
}

/** `onClear` adds the trash button to the right of the record button; without it there is nothing to clear. */
export function RecordDock({
  recording,
  onToggle,
  onClear,
}: {
  recording: boolean;
  onToggle: () => void;
  onClear?: () => void;
}) {
  const fullW = useWindowDimensions().width - MARGIN * 2;
  // The collapsed box is invisible, but touches only land inside it, so it makes room for the trash button and its
  // mirror slot.
  const collapsedW = onClear ? COLLAPSED_W + (CLEAR_D + space.sm) * 2 : COLLAPSED_W;
  const progress = useSharedValue(recording ? 1 : 0);
  useEffect(() => {
    progress.value = withSpring(recording ? 1 : 0, SPRING);
  }, [recording, progress]);

  const boxStyle = useAnimatedStyle(() => ({
    width: interpolate(progress.value, [0, 1], [collapsedW, fullW]),
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
        <View style={styles.controls}>
          {/* Mirrors the trash button so the record button stays centred and never jumps. */}
          {onClear && <View style={styles.clearSlot} />}
          <ActionButton
            label={recording ? "Parar" : "Gravar"}
            icon={recording ? "stop.fill" : "mic.fill"}
            tone={recording ? "danger" : "primary"}
            size="large"
            onPress={onToggle}
          />
          {onClear && <ClearButton onPress={onClear} />}
        </View>
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
  controls: { flexDirection: "row", alignItems: "center", gap: space.sm },
  clearSlot: { width: CLEAR_D },
  playhead: { position: "absolute", top: 0, width: 2, height: WAVE_H, borderRadius: 1, backgroundColor: colors.danger },
});
