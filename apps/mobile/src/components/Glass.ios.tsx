import { Button, Host, HStack, Image, Text } from "@expo/ui/swift-ui";
import { buttonStyle, controlSize, font, foregroundStyle, tint } from "@expo/ui/swift-ui/modifiers";
import { GlassContainer, GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import { colors } from "../theme";
import * as Flat from "./Flat";
import type { ActionButtonProps, SurfaceGroupProps, SurfaceProps } from "./Glass.types";

/** iOS 26+ with the glass API present (some 26 betas lack it and crash). Older iOS gets the flat controls. */
const GLASS = isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

export function Surface({ tint, interactive, visible, ...props }: SurfaceProps) {
  if (!GLASS) return <Flat.Surface tint={tint} visible={visible} {...props} />;
  // Fading a parent's opacity breaks the glass while it animates, so the effect itself animates instead.
  const effect =
    visible === undefined ? "regular" : { style: visible ? ("regular" as const) : ("none" as const), animate: true };
  return (
    <GlassView glassEffectStyle={effect} colorScheme="dark" tintColor={tint} isInteractive={interactive} {...props} />
  );
}

export function SurfaceGroup({ spacing, ...props }: SurfaceGroupProps) {
  if (!GLASS) return <Flat.SurfaceGroup {...props} />;
  return <GlassContainer spacing={spacing} {...props} />;
}

// [glass tint, label colour, SwiftUI button style]; dark green on lime green, as design2.md does its CTAs.
const TONE = {
  primary: [colors.primary, colors.onPrimary, "glassProminent"],
  secondary: [undefined, colors.onDark, "glass"],
  danger: [colors.danger, colors.onDark, "glassProminent"],
} as const;

const CONTROL_SIZE = { mini: "small", small: "regular", medium: "large", large: "extraLarge" } as const;

/** A native SwiftUI Liquid Glass button (Expo UI). */
export function ActionButton(props: ActionButtonProps) {
  if (!GLASS) return <Flat.ActionButton {...props} />;
  const { label, icon, tone = "primary", size = "medium", onPress } = props;
  const [bg, fg, style] = TONE[tone];
  return (
    <Host matchContents colorScheme="dark">
      <Button
        onPress={onPress}
        modifiers={[buttonStyle(style), controlSize(CONTROL_SIZE[size]), ...(bg ? [tint(bg)] : [])]}
      >
        <HStack spacing={6} modifiers={[foregroundStyle(fg)]}>
          {icon ? <Image systemName={icon} /> : null}
          <Text modifiers={[font({ weight: "semibold" })]}>{label}</Text>
        </HStack>
      </Button>
    </Host>
  );
}
