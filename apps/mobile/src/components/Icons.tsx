import Svg, { Path } from "react-native-svg";

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
