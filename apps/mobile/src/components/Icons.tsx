import Svg, { Circle, Path } from "react-native-svg";

type IconProps = { size?: number; color: string };

const STAR = "M12 3.2l2.7 5.5 6 .9-4.35 4.25 1.03 6-5.38-2.83-5.38 2.83 1.03-6L3.3 9.6l6-.9z";

/** Outlined, or filled once favourited. Drawn rather than taken from an icon font so both platforms match. */
export function StarIcon({ size = 22, color, filled }: IconProps & { filled?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={STAR} fill={filled ? color : "none"} stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
    </Svg>
  );
}

export function RecheckIcon({ size = 22, color }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4v4h-4" />
    </Svg>
  );
}

export function TrashIcon({ size = 22, color }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M4 6.5h16M9.5 6.5V4.5h5v2M6.5 6.5l.9 12.6a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-12.6M10 10.5v6M14 10.5v6" />
    </Svg>
  );
}

export function InfoIcon({ size = 22, color }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M12 11v6M12 7.5v.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
    </Svg>
  );
}

/** Points right; rotate it to point down for an expanded row. */
export function ChevronIcon({ size = 22, color }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M9.5 6l6 6-6 6" />
    </Svg>
  );
}

export function WarningIcon({ size = 22, color }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M10.3 4.2 2.6 17.6A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-2.9L13.7 4.2a2 2 0 0 0-3.4 0zM12 9.5v4.5M12 17.2v.01" />
    </Svg>
  );
}

/** Three dots: more actions. */
export function MoreIcon({ size = 22, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Circle cx={5.5} cy={12} r={1.8} />
      <Circle cx={12} cy={12} r={1.8} />
      <Circle cx={18.5} cy={12} r={1.8} />
    </Svg>
  );
}
