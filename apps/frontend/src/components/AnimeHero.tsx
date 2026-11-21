import type { ReactNode } from "react";

/**
 * Compact LogPose Nautical Home Banner (112026_logpose_ui_spec.pdf):
 * - Sky Blue (#123A6B), Coral Sail (#FF6B4A) horizon band, Sunshine (#FFC857) sun,
 *   Ocean Teal (#13747D) wave, white sailboat, Sunshine HOME PORT kicker chip, Fraunces 900 title.
 */
export function AnimeHero({
  title,
  subtitle,
  tag = "HOME PORT",
  rightSlot,
}: {
  title: string;
  subtitle?: string;
  tag?: string;
  rightSlot?: ReactNode;
}) {
  return (
    <div
      style={{
        position: "relative",
        minHeight: 176,
        margin: "-16px -16px 0 -16px",
        padding: "18px 28px 20px",
        overflow: "hidden",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: 16,
        background: "#123A6B",
        borderBottom: "2px solid #0B2545",
        color: "#FFFFFF",
      }}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 1200 160"
        preserveAspectRatio="xMidYMid slice"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
      >
        {/* Sky Blue */}
        <rect x="0" y="0" width="1200" height="160" fill="#123A6B" />
        {/* Coral Sail horizon band */}
        <rect x="0" y="88" width="1200" height="32" fill="#FF6B4A" opacity="0.9" />
        {/* Sunshine sun */}
        <circle cx="960" cy="82" r="44" fill="#FFC857" />
        {/* Ocean Teal wave */}
        <path
          d="M0 118 Q 220 96 440 118 T 880 118 T 1200 112 L 1200 160 L 0 160 Z"
          fill="#13747D"
        />
        {/* Deep Navy front wave */}
        <path d="M0 138 Q 300 124 600 138 T 1200 134 L 1200 160 L 0 160 Z" fill="#0B2545" />
        {/* White sailboat */}
        <g transform="translate(860, 74)">
          <path d="M18 0 L18 36 L0 36 Z" fill="#FFFFFF" />
          <path d="M22 6 L22 36 L36 36 Z" fill="#F6E7C8" />
          <path d="M-4 39 L40 39 L32 47 L4 47 Z" fill="#0B2545" />
        </g>
        {/* Four-point stars */}
        <g fill="#FFC857">
          <path d="M590 22 L593 29 L600 32 L593 35 L590 42 L587 35 L580 32 L587 29 Z" />
          <path
            d="M740 34 L742 39 L747 41 L742 43 L740 48 L738 43 L733 41 L738 39 Z"
            fill="#FFFFFF"
          />
        </g>
      </svg>

      {/* Directional navy scrim for text-to-background separation */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "linear-gradient(90deg, rgba(18, 58, 107, 0.88) 0%, rgba(18, 58, 107, 0.62) 52%, rgba(18, 58, 107, 0) 82%)",
        }}
      />

      <div style={{ position: "relative", zIndex: 1, maxWidth: "min(680px, 65%)" }}>
        <span
          style={{
            display: "inline-block",
            padding: "3px 10px",
            marginBottom: 6,
            background: "#FFC857",
            color: "#0B2545",
            border: "1.5px solid #0B2545",
            borderRadius: 9999,
            fontFamily: "var(--font-mono)",
            fontWeight: 500,
            fontSize: 11,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {tag}
        </span>
        <h1
          style={{
            margin: 0,
            fontFamily: "var(--font-display)",
            fontWeight: 900,
            fontSize: "clamp(1.65rem, 2.4vw, 2.125rem)",
            lineHeight: 1.15,
            letterSpacing: "-0.025em",
            color: "#FFFFFF",
            textShadow: "3px 3px 0 #0B2545",
          }}
        >
          {title}
        </h1>
        {subtitle ? (
          <p
            style={{
              margin: "4px 0 0",
              fontFamily: "var(--font-body)",
              fontSize: 14,
              lineHeight: 1.4,
              color: "#DFF3F1",
              textShadow: "0 1px 2px rgba(11, 37, 69, 0.85)",
            }}
          >
            {subtitle}
          </p>
        ) : null}
      </div>

      {rightSlot ? (
        <div style={{ position: "relative", zIndex: 2, flexShrink: 0 }}>{rightSlot}</div>
      ) : null}
    </div>
  );
}
