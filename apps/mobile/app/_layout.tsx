import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useTheme } from "../src/theme";

export default function Layout() {
  const t = useTheme();
  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerStyle: { backgroundColor: t.bg }, headerTintColor: t.text, contentStyle: { backgroundColor: t.bg } }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="claim/[id]" options={{ title: "Afirmação" }} />
      </Stack>
    </>
  );
}
