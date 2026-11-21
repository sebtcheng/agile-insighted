import type { CSSProperties, ReactNode } from "react";

export interface PirateIconProps {
  size?: number;
  className?: string;
  style?: CSSProperties;
}

function Svg({ size = 18, className, style, children }: PirateIconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={{ flexShrink: 0, ...style }}
    >
      {children}
    </svg>
  );
}

/** Minimalist straw hat silhouette with ribbon band. */
export function StrawHatIcon(props: PirateIconProps) {
  return (
    <Svg {...props}>
      <path d="M2 15.5c3.5 1.8 16.5 1.8 20 0" />
      <path d="M6.5 14.5C7 9.5 9 7 12 7s5 2.5 5.5 7.5" />
      <path d="M6.8 12.8c3.2.9 7.2.9 10.4 0" />
    </Svg>
  );
}

/** Stylized Jolly Roger / skull-and-crossbones emblem. */
export function JollyRogerIcon(props: PirateIconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="9" r="5" />
      <circle cx="10.2" cy="8.5" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="13.8" cy="8.5" r="0.8" fill="currentColor" stroke="none" />
      <path d="M10.5 13.5v2M13.5 13.5v2" />
      <path d="M5 19l14-4M5 15l14 4" />
    </Svg>
  );
}

/** Log-pose wrist compass. */
export function LogPoseIcon(props: PirateIconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="6.5" />
      <path d="M12 2.5v3M12 18.5v3" />
      <path d="M12 8.5l2.5 3.5-2.5 3.5-2.5-3.5z" />
    </Svg>
  );
}

/** Pirate pennant / flag. */
export function PirateFlagIcon(props: PirateIconProps) {
  return (
    <Svg {...props}>
      <path d="M5 3v18" />
      <path d="M5 4h13l-2.5 4L18 12H5" />
    </Svg>
  );
}

/** Classic nautical compass rose. */
export function CompassRoseIcon(props: PirateIconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z" />
    </Svg>
  );
}

/** Ship's helm / wheel. */
export function ShipsHelmIcon(props: PirateIconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M19.1 4.9l-2.8 2.8M7.7 16.3l-2.8 2.8" />
    </Svg>
  );
}

/** Classic anchor. */
export function AnchorIcon(props: PirateIconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7v14M8 10h8M5 14a7 7 0 0014 0" />
    </Svg>
  );
}

/** Nautical spyglass. */
export function SpyglassIcon(props: PirateIconProps) {
  return (
    <Svg {...props}>
      <path d="M3 19l5-5M8 14l4-4 3 3-4 4zM12 10l5-5 3 3-5 5z" />
    </Svg>
  );
}

/** Crossed cutlasses. */
export function CrossedCutlassesIcon(props: PirateIconProps) {
  return (
    <Svg {...props}>
      <path d="M4 20L19 5M15 4l5 1-1 5" />
      <path d="M20 20L5 5M9 4L4 5l1 5" />
      <path d="M6 16l2 2M18 16l-2 2" />
    </Svg>
  );
}

/** Subtle nautical wave / treasure-map trail. */
export function NauticalWaveIcon(props: PirateIconProps) {
  return (
    <Svg {...props}>
      <path d="M2 10c2.5-2.5 5.5-2.5 8 0s5.5 2.5 8 0 3.5-1.5 4-1" />
      <path d="M2 16c2.5-2.5 5.5-2.5 8 0s5.5 2.5 8 0 3.5-1.5 4-1" />
    </Svg>
  );
}

/** Minimalist sailboat. */
export function SailboatIcon(props: PirateIconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3v12" />
      <path d="M12 4l7 9h-7z" />
      <path d="M12 6L6 13h6z" />
      <path d="M3 17h18l-2 3H5z" />
    </Svg>
  );
}

/** Non-interactive, low-opacity background watermark wrapper. */
export function NauticalWatermark({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        pointerEvents: "none",
        userSelect: "none",
        opacity: 0.06,
        color: "var(--text-primary, #0B2545)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
