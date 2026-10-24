import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { useShallow } from "zustand/react/shallow";
import { useAudioTransport } from "../src/audio";
import { ClaimCard } from "../src/components/ClaimCard";
import { EmptyClaims } from "../src/components/EmptyClaims";
import { Favorites } from "../src/components/Favorites";
import { FilterChips } from "../src/components/FilterChips";
import { Surface } from "../src/components/Glass";
import { InfoIcon } from "../src/components/Icons";
import { Logo } from "../src/components/Logo";
import { dockInset, RecordDock } from "../src/components/RecordDock";
import { AUDIO_MODE } from "../src/config";
import { endSession, sendText, start } from "../src/live";
import { matchesFilter, useStore } from "../src/store";
import { colors, font, IOS, radius, space, type } from "../src/theme";

const renderItem = ({ item }: { item: string }) => <ClaimCard id={item} />;
const keyExtractor = (id: string) => id;

/** How close to the top still counts as "at the top" for following new claims. */
const FOLLOW_THRESHOLD = 24;
const LINE_H = 25;
const LINES = 4;

/** The canvas melting into whatever scrolls beneath it, so content slides away instead of being cut. */
function TopFade({ height }: { height: number }) {
  return (
    <Svg style={[styles.fade, { height }]} pointerEvents="none">
      <Defs>
        <LinearGradient id="top" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.canvas} stopOpacity="1" />
          <Stop offset="1" stopColor={colors.canvas} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#top)" />
    </Svg>
  );
}

/**
 * Teleprompter transcript: what was said before dims and scrolls up under a fade, the sentence being spoken
 * stays bright at the bottom. Scroll up to read back; it follows the speech again once back at the bottom.
 * The empty state's "Digitar afirmação" opens a field under it to type a claim instead of speaking. During a
 * conversation it keeps its place even before anyone speaks; outside one it takes no space until there is something
 * to show.
 */
function Transcript({ typing, setTyping }: { typing: boolean; setTyping: (v: boolean) => void }) {
  const lines = useStore(useShallow((s) => s.utterances.map((u) => u.text)));
  const partial = useStore((s) => s.partial);
  const live = useStore((s) => s.live);
  const recording = useStore((s) => s.recording);
  const [text, setText] = useState("");
  const scroller = useRef<ScrollViewInstance>(null);
  const following = useRef(true);

  // Judged only when the user's own scroll comes to rest, so the follow animation never turns following off.
  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    following.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - FOLLOW_THRESHOLD;
  };

  const submit = () => {
    const v = text.trim();
    if (!v) return;
    setText("");
    sendText(v).catch((e) => useStore.getState().set({ error: String(e) }));
  };

  // The live partial is the current sentence; between sentences it is the last one finished.
  const current = partial || lines.at(-1) || "";
  const earlier = (partial ? lines : lines.slice(0, -1)).join(" ");
  if (!current && !typing && !live) return null;

  return (
    <Animated.View entering={FadeIn.duration(300)} exiting={FadeOut.duration(200)}>
      <View style={styles.transcript}>
        {!current && live && (
          <View style={styles.window}>
            <Text style={styles.waiting}>{recording ? "Ouvindo…" : "Gravação pausada"}</Text>
          </View>
        )}
        {!!current && (
          <View style={styles.window}>
            <ScrollView
              ref={scroller}
              // Short text sits at the bottom, where the newest words appear.
              contentContainerStyle={styles.scrollBody}
              onContentSizeChange={() => following.current && scroller.current?.scrollToEnd({ animated: true })}
              onScrollEndDrag={settle}
              onMomentumScrollEnd={settle}
              indicatorStyle="white"
            >
              <Text style={styles.earlier}>
                {earlier && `${earlier} `}
                <Text style={styles.current}>{current}</Text>
              </Text>
            </ScrollView>
            <TopFade height={LINE_H} />
          </View>
        )}
        {typing && (
          <TextInput
            autoFocus
            value={text}
            onChangeText={setText}
            onSubmitEditing={submit}
            submitBehavior="submit"
            // Closes again once dismissed, unless a draft is left in it.
            onBlur={() => !text.trim() && setTyping(false)}
            placeholder="Digite uma afirmação para testar"
            placeholderTextColor={colors.muted}
            selectionColor={colors.primary}
            cursorColor={colors.primary}
            keyboardAppearance="dark"
            returnKeyType="send"
            style={styles.input}
          />
        )}
      </View>
    </Animated.View>
  );
}

/**
 * Stays put above the list; only the claims scroll, sliding under the filters. Favourites are for browsing, so a
 * conversation puts them away until the dock's trash button ends it.
 */
function ClaimsHeader() {
  const live = useStore((s) => s.live);
  return (
    <>
      {!live && (
        <Animated.View entering={FadeIn.duration(300)} exiting={FadeOut.duration(200)}>
          <Favorites />
        </Animated.View>
      )}
      <Animated.View layout={LinearTransition.springify().duration(450).dampingRatio(0.9)}>
        <Text style={styles.section}>Afirmações</Text>
        <FilterChips />
      </Animated.View>
    </>
  );
}

/**
 * Newest claim first. At the top, the list follows: new claims land in view and push the older ones down. Scrolled
 * into the list, it holds still (FlashList keeps the first visible card anchored) until the user is back at the top.
 */
function ClaimList({ bottomInset, onType }: { bottomInset: number; onType: () => void }) {
  // Only the list of visible ids is selected; shallow equality skips re-renders when it did not change.
  const ids = useStore(useShallow((s) => s.order.filter((id) => matchesFilter(s.claims[id], s.filter))));
  const live = useStore((s) => s.live);
  const [following, setFollowing] = useState(true);
  // Re-renders only when crossing the threshold; the same boolean bails out of the update.
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => setFollowing(e.nativeEvent.contentOffset.y <= FOLLOW_THRESHOLD),
    [],
  );
  // Anchoring is what would push a new claim above the viewport, so it is only on while away from the top.
  const anchor = useMemo(() => ({ disabled: following }), [following]);
  return (
    <FlashList
      data={ids}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      maintainVisibleContentPosition={anchor}
      onScroll={onScroll}
      scrollEventThrottle={32}
      ListEmptyComponent={<EmptyClaims live={live} onType={onType} />}
      // The record dock floats over the list, so the last card can scroll clear of it.
      contentContainerStyle={{ paddingBottom: bottomInset }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    />
  );
}

export default function Live() {
  const transport = useAudioTransport();
  const recording = useStore((s) => s.recording);
  const error = useStore((s) => s.error);
  const live = useStore((s) => s.live);
  const hasClaims = useStore((s) => s.order.length > 0);
  const [typing, setTyping] = useState(false);

  const toggle = useCallback(async () => {
    const { set } = useStore.getState();
    try {
      if (useStore.getState().recording) {
        await transport.stop();
        set({ recording: false });
      } else {
        await start(); // session + socket first, so no audio is lost
        await transport.start();
        set({ recording: true, live: true, error: null });
      }
    } catch (e) {
      set({ recording: false, error: e instanceof Error ? e.message : String(e) });
    }
  }, [transport]);

  const clear = () => {
    void transport.stop();
    useStore.getState().set({ recording: false, live: false });
    setTyping(false);
    void endSession();
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Logo size={IOS ? 30 : 28} />
        <View style={styles.flex} />
        <Surface interactive style={styles.info}>
          <Pressable
            onPress={() => router.push("/how-it-works")}
            hitSlop={8}
            style={({ pressed }) => [styles.infoHit, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Como funciona"
          >
            <InfoIcon color={colors.onDark} />
          </Pressable>
        </Surface>
      </View>
      <Transcript typing={typing} setTyping={setTyping} />
      {!!error && <Text style={styles.error}>{error}</Text>}
      <ClaimsHeader />
      <Animated.View style={styles.flex} layout={LinearTransition.springify().duration(450).dampingRatio(0.9)}>
        <ClaimList bottomInset={dockInset(recording)} onType={() => setTyping(true)} />
        <TopFade height={space.md} />
        {/* Clearing only when there is something to clear; a conversation paused before any fact still needs a way out. */}
        <RecordDock
          recording={recording}
          onToggle={toggle}
          onClear={hasClaims || (live && !recording) ? clear : undefined}
        />
      </Animated.View>
      {AUDIO_MODE === "chunked" && <Text style={styles.mode}>modo chunked (Expo Go)</Text>}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: space.md,
    paddingTop: 6,
  },
  transcript: { paddingHorizontal: space.md, paddingTop: space.lg, paddingBottom: space.sm },
  // Same size as the favourite star in the claim screen's header.
  info: { width: 36, height: 36, borderRadius: 18 },
  infoHit: { flex: 1, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.6 },
  window: { height: LINE_H * LINES, justifyContent: "flex-end", overflow: "hidden" },
  scrollBody: { flexGrow: 1, justifyContent: "flex-end", paddingTop: LINE_H / 2 },
  fade: { position: "absolute", top: 0, left: 0, right: 0 },
  earlier: { ...type.bodyMd, fontSize: 18, lineHeight: LINE_H, color: colors.muted },
  waiting: { ...type.bodyMd, fontSize: 18, lineHeight: LINE_H, color: colors.mutedSoft },
  current: { ...font("600"), color: colors.onDark },
  input: {
    ...type.bodyMd,
    color: colors.onDark,
    height: IOS ? 44 : 40,
    marginTop: space.xs,
    paddingHorizontal: 14,
    paddingVertical: 0,
    backgroundColor: colors.surfaceElevated,
    borderRadius: IOS ? radius.pill : radius.md,
    // design.md's focused text-input; the field only exists while focused.
    ...(IOS ? null : { borderWidth: 1, borderColor: colors.primary }),
  },
  error: { ...type.bodySm, color: colors.danger, paddingHorizontal: space.md, paddingTop: space.xs },
  section: { ...type.titleLg, color: colors.onDark, paddingHorizontal: space.md, marginTop: space.lg },
  mode: { ...type.caption, fontSize: 11, color: colors.muted, textAlign: "center", paddingBottom: 4 },
});
