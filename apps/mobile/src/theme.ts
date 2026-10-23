import { useColorScheme } from "react-native";

const LIGHT = { bg: "#f4f4f6", card: "#ffffff", text: "#111827", sub: "#6b7280", border: "#e5e7eb", accent: "#2563eb", danger: "#dc2626" };
const DARK = { bg: "#0b0b0f", card: "#17171c", text: "#f3f4f6", sub: "#9ca3af", border: "#2a2a33", accent: "#60a5fa", danger: "#f87171" };

export const useTheme = () => (useColorScheme() === "dark" ? DARK : LIGHT);
