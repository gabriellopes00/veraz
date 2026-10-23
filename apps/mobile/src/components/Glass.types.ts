import type { ComponentProps } from "react";
import type { ViewProps } from "react-native";
import type { Image } from "@expo/ui/swift-ui";

export type SurfaceProps = ViewProps & {
  /** Fill on the flat surface; tint of the glass on iOS. */
  tint?: string;
  /** Glass reacts to touch (iOS 26+). */
  interactive?: boolean;
  /** Animates the surface in and out: the glass materializes on iOS 26, the flat surface fades. */
  visible?: boolean;
};

export type SurfaceGroupProps = ViewProps & {
  /** Distance at which neighbouring glass shapes start to blend (iOS 26+). */
  spacing?: number;
};

export type ActionButtonProps = {
  label: string;
  /** SF Symbol shown next to the label on iOS. */
  icon?: ComponentProps<typeof Image>["systemName"];
  tone?: "primary" | "secondary" | "danger";
  /** @default "medium" */
  size?: "mini" | "small" | "medium" | "large";
  onPress: () => void;
};
