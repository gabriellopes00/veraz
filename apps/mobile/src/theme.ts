import { Platform, StyleSheet, type TextStyle, type ViewStyle } from "react-native";

/**
 * Design tokens from design.md (black canvas), with the accent swapped for the lime-green palette of
 * design2.md. The app is dark-only, like the system.
 * Android follows the system to the letter (Inter, 8/12px radii, flat hairline cards). iOS keeps the
 * colors but speaks the platform's language: SF Pro, continuous corners and Liquid Glass controls.
 */
export const IOS = Platform.OS === "ios";

export const colors = {
  canvas: "#0a0a0a",
  surfaceSoft: "#121212",
  surfaceCard: "#1a1a1a",
  surfaceElevated: "#242424",
  hairline: "#2a2a2a",
  hairlineStrong: "#3a3a3a",
  onDark: "#ffffff",
  body: "#cccccc",
  bodyStrong: "#e6e6e6",
  muted: "#888888",
  mutedSoft: "#5a5a5a",
  primary: "#9fe870",
  primaryActive: "#cdffad",
  primaryDisabled: "#163300",
  onPrimary: "#163300",
  success: "#22c55e",
  warning: "#ffd11a",
  danger: "#ef4444",
  info: "#3b82f6",
} as const;

export const space = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

/** iOS rounds a notch further so cards sit comfortably next to glass capsules. */
export const radius = IOS ? { xs: 6, sm: 10, md: 12, lg: 20, pill: 999 } : { xs: 4, sm: 6, md: 8, lg: 12, pill: 999 };

/** Squircle corners on iOS; no-op on Android. */
export const continuous: ViewStyle = { borderCurve: "continuous" };

/** Content card. Glass is for controls floating above content, so cards stay solid on every platform. */
export const card: ViewStyle = {
  ...continuous,
  backgroundColor: colors.surfaceCard,
  borderRadius: radius.lg,
  borderWidth: IOS ? 0 : StyleSheet.hairlineWidth,
  borderColor: colors.hairline,
};

const INTER = {
  "400": "Inter_400Regular",
  "500": "Inter_500Medium",
  "600": "Inter_600SemiBold",
  "700": "Inter_700Bold",
} as const;
type Weight = keyof typeof INTER;

/** Inter on Android (each weight is its own family there), the system font on iOS. */
export const font = (weight: Weight): TextStyle => (IOS ? { fontWeight: weight } : { fontFamily: INTER[weight] });

/** Inter needs the design's negative tracking; SF Pro already tracks tightly, so iOS gets a third of it. */
const track = (px: number) => (IOS ? px / 3 : px);

export const type = {
  displaySm: { ...font("700"), fontSize: IOS ? 34 : 32, lineHeight: IOS ? 41 : 38, letterSpacing: track(-1) },
  titleLg: { ...font("700"), fontSize: 22, lineHeight: 28, letterSpacing: track(-0.3) },
  titleMd: { ...font("600"), fontSize: 18, lineHeight: 25 },
  titleSm: { ...font("600"), fontSize: 16, lineHeight: 22 },
  stat: { ...font("700"), fontSize: 48, lineHeight: 50, letterSpacing: track(-1.5), color: colors.primary },
  bodyMd: { ...font("400"), fontSize: 16, lineHeight: 24 },
  bodySm: { ...font("400"), fontSize: 14, lineHeight: 21 },
  caption: { ...font("500"), fontSize: 13, lineHeight: 18 },
  captionUpper: { ...font("600"), fontSize: 12, lineHeight: 17, letterSpacing: 1.5, textTransform: "uppercase" },
  button: { ...font("600"), fontSize: IOS ? 16 : 14 },
} satisfies Record<string, TextStyle>;
