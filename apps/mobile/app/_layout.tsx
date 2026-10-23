import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from "@expo-google-fonts/inter";
import { Outfit_700Bold } from "@expo-google-fonts/outfit";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { colors, font, IOS } from "../src/theme";

// iOS uses SF Pro, so Inter is only loaded where the design system is applied as-is.
// Outfit is the wordmark's typeface and is needed on every platform.
const FONTS = IOS ? { Outfit_700Bold } : { Outfit_700Bold, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold };

export default function Layout() {
  const [loaded] = useFonts(FONTS);
  if (!loaded) return null;
  return (
    // Needed by the swipeable claim rows.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerTintColor: colors.onDark,
          contentStyle: { backgroundColor: colors.canvas },
          // On iOS 26 an unset header background gives the system's transparent Liquid Glass bar.
          ...(IOS ? {} : { headerStyle: { backgroundColor: colors.canvas }, headerShadowVisible: false, headerTitleStyle: font("600") }),
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="claim/[id]" options={{ title: "Afirmação" }} />
      </Stack>
    </GestureHandlerRootView>
  );
}
