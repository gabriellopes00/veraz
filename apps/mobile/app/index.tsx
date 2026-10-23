import { useCallback, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
import { useShallow } from "zustand/react/shallow";
import { useAudioTransport } from "../src/audio";
import { ClaimCard } from "../src/components/ClaimCard";
import { FilterChips } from "../src/components/FilterChips";
import { AUDIO_MODE } from "../src/config";
import { endSession, sendText, start } from "../src/live";
import { matchesFilter, useStore } from "../src/store";
import { useTheme } from "../src/theme";

const renderItem = ({ item }: { item: string }) => <ClaimCard id={item} />;
const keyExtractor = (id: string) => id;

function Transcript() {
  const t = useTheme();
  const lines = useStore(useShallow((s) => s.utterances.slice(-3).map((u) => u.text)));
  const partial = useStore((s) => s.partial);
  return (
    <View style={[styles.transcript, { backgroundColor: t.card, borderColor: t.border }]}>
      {lines.length === 0 && !partial && <Text style={{ color: t.sub }}>A transcrição aparece aqui…</Text>}
      {lines.map((l, i) => (
        <Text key={i} style={{ color: t.text }} numberOfLines={2}>{l}</Text>
      ))}
      {!!partial && <Text style={{ color: t.sub, fontStyle: "italic" }} numberOfLines={2}>{partial}</Text>}
    </View>
  );
}

function ClaimList() {
  const t = useTheme();
  // Only the list of visible ids is selected; shallow equality skips re-renders when it did not change.
  const ids = useStore(useShallow((s) => s.order.filter((id) => matchesFilter(s.claims[id], s.filter))));
  return (
    <FlashList
      data={ids}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      ListEmptyComponent={<Text style={[styles.empty, { color: t.sub }]}>Nenhuma afirmação ainda. Fale ou digite abaixo.</Text>}
      keyboardShouldPersistTaps="handled"
    />
  );
}

export default function Live() {
  const t = useTheme();
  const transport = useAudioTransport();
  const recording = useStore((s) => s.recording);
  const connection = useStore((s) => s.connection);
  const error = useStore((s) => s.error);
  const [text, setText] = useState("");

  const toggle = useCallback(async () => {
    const { set } = useStore.getState();
    try {
      if (useStore.getState().recording) {
        await transport.stop();
        set({ recording: false });
      } else {
        await start(); // session + socket first, so no audio is lost
        await transport.start();
        set({ recording: true, error: null });
      }
    } catch (e) {
      set({ recording: false, error: e instanceof Error ? e.message : String(e) });
    }
  }, [transport]);

  const submit = () => {
    const v = text.trim();
    if (!v) return;
    setText("");
    sendText(v).catch((e) => useStore.getState().set({ error: String(e) }));
  };

  const dot = connection === "open" ? "#16a34a" : connection === "idle" ? t.sub : "#d97706";

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: t.bg }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: t.text }]}>Veraz</Text>
          <View style={[styles.dot, { backgroundColor: dot }]} />
          <Text style={{ color: t.sub, flex: 1 }}>{recording ? "ouvindo" : connection === "idle" ? "parado" : connection}</Text>
          <Pressable onPress={() => { void transport.stop(); useStore.getState().set({ recording: false }); void endSession(); }}>
            <Text style={{ color: t.accent, fontWeight: "600" }}>Limpar</Text>
          </Pressable>
        </View>
        <Transcript />
        {!!error && <Text style={{ color: t.danger, paddingHorizontal: 16 }}>{error}</Text>}
        <FilterChips />
        <View style={styles.flex}>
          <ClaimList />
        </View>
        <View style={styles.footer}>
          <TextInput
            value={text}
            onChangeText={setText}
            onSubmitEditing={submit}
            placeholder="Digite uma afirmação para testar"
            placeholderTextColor={t.sub}
            returnKeyType="send"
            style={[styles.input, { color: t.text, backgroundColor: t.card, borderColor: t.border }]}
          />
          <Pressable onPress={toggle} style={[styles.rec, { backgroundColor: recording ? t.danger : t.accent }]}>
            <Text style={styles.recText}>{recording ? "■ Parar" : "● Gravar"}</Text>
          </Pressable>
        </View>
        {AUDIO_MODE === "chunked" && <Text style={[styles.mode, { color: t.sub }]}>modo chunked (Expo Go)</Text>}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingTop: 6 },
  title: { fontSize: 26, fontWeight: "800" },
  dot: { width: 9, height: 9, borderRadius: 5 },
  transcript: { margin: 12, padding: 12, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, minHeight: 74, gap: 2 },
  empty: { textAlign: "center", marginTop: 40 },
  footer: { flexDirection: "row", gap: 8, padding: 12, alignItems: "center" },
  input: { flex: 1, height: 46, borderRadius: 23, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, fontSize: 15 },
  rec: { height: 46, paddingHorizontal: 18, borderRadius: 23, justifyContent: "center" },
  recText: { color: "#fff", fontWeight: "700" },
  mode: { textAlign: "center", fontSize: 11, paddingBottom: 4 },
});
