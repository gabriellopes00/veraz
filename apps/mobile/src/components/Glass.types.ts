import type { Image } from "@expo/ui/swift-ui";
import type { ComponentProps, ReactNode } from "react";
import type { ViewProps } from "react-native";
import type { Confirm } from "../confirm";

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

export type ConfirmButtonProps = {
  /** SF Symbol drawn on the Liquid Glass button. */
  icon: ComponentProps<typeof Image>["systemName"];
  /** Drawn by the flat button, which has no SF Symbols. */
  fallbackIcon: ReactNode;
  /** Accessibility label. */
  label: string;
  /** Diameter of the round button. */
  size: number;
  /** What the dialog asks; `action` names the destructive button. */
  confirm: Confirm;
  onConfirm: () => void;
};
