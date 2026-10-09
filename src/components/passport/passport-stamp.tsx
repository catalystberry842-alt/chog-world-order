import { StampMotifArt } from "@/components/passport/stamp-motifs";
import { formatDate } from "@/lib/format";
import type { StampColor, StampDefinition } from "@/lib/passport/stamps";

const stampFill: Record<StampColor, string> = {
  purple: "var(--monad-400)",
  pink: "var(--blush-400)",
  mint: "var(--crayon-mint)",
  sky: "var(--crayon-sky)",
  yellow: "var(--crayon-yellow)",
  orange: "var(--crayon-orange)",
};

/** Rectangle with semicircle "perforation" bites, traced clockwise. */
function perforatedRect(x: number, y: number, size: number, bites: number, r: number) {
  const step = size / bites;
  const parts = [`M${x} ${y}`];
  const edge = (point: (offset: number) => [number, number, number, number]) => {
    for (let i = 0; i < bites; i += 1) {
      const [x1, y1, x2, y2] = point(step * (i + 0.5));
      parts.push(`L${x1} ${y1}`, `A${r} ${r} 0 0 0 ${x2} ${y2}`);
    }
  };
  edge((o) => [x + o - r, y, x + o + r, y]);
  parts.push(`L${x + size} ${y}`);
  edge((o) => [x + size, y + o - r, x + size, y + o + r]);
  parts.push(`L${x + size} ${y + size}`);
  edge((o) => [x + size - o + r, y + size, x + size - o - r, y + size]);
  parts.push(`L${x} ${y + size}`);
  edge((o) => [x, y + size - o + r, x, y + size - o - r]);
  parts.push("Z");
  return parts.join(" ");
}

const stampOutline = perforatedRect(2, 2, 96, 9, 2.6);

type PassportStampProps = {
  stamp: StampDefinition;
  /** Date the stamp was issued. Omit to render the stamp as locked. */
  issuedAt?: string;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
};

const sizeClass = {
  sm: "w-16",
  md: "w-24",
  lg: "w-32",
} as const;

/**
 * A crayon-style passport stamp. Earned stamps are coloured and cancelled
 * with a postmark; locked stamps are greyed out with their earning rule.
 */
export function PassportStamp({ stamp, issuedAt, size = "md", showLabel = true }: PassportStampProps) {
  const awardedLabel = issuedAt ? formatDate(issuedAt) : null;
  const earned = awardedLabel !== null;
  const tilt = (stamp.category.length % 5) - 2;

  return (
    <figure className="flex flex-col items-center gap-2 text-center">
      <svg
        viewBox="0 0 100 100"
        className={`${sizeClass[size]} h-auto drop-shadow-[0_6px_10px_rgba(10,6,20,0.35)] transition-transform duration-200 hover:rotate-0 motion-reduce:transition-none ${
          earned ? "" : "opacity-70 grayscale"
        }`}
        style={{ rotate: `${tilt}deg` }}
        role="img"
        aria-label={
          earned
            ? `${stamp.name} stamp, issued ${awardedLabel}`
            : `${stamp.name} stamp, not earned yet`
        }
      >
        <path d={stampOutline} fill="var(--paper)" />
        <g filter="url(#crayon)">
          <rect x="11" y="11" width="78" height="78" rx="10" fill={earned ? stampFill[stamp.color] : "#cfc6dd"} />
          <rect x="11" y="11" width="78" height="78" rx="10" fill="url(#crayon-hatch)" />
        </g>
        <g filter="url(#crayon-line)" opacity={earned ? 1 : 0.45}>
          <StampMotifArt motif={stamp.motif} />
        </g>
        {!earned && (
          <rect
            x="11"
            y="11"
            width="78"
            height="78"
            rx="10"
            fill="none"
            stroke="var(--ink)"
            strokeOpacity="0.5"
            strokeWidth="2"
            strokeDasharray="5 4"
          />
        )}
        {earned && (
          // Postmark cancellation lines.
          <g
            fill="none"
            stroke="var(--ink)"
            strokeOpacity="0.35"
            strokeWidth="1.8"
            strokeLinecap="round"
            filter="url(#crayon-line)"
          >
            <circle cx="78" cy="22" r="11" />
            <path d="M58 18c4-3 8 3 12 0s8 3 12 0 8 3 12 0" />
            <path d="M58 26c4-3 8 3 12 0s8 3 12 0 8 3 12 0" />
          </g>
        )}
        {stamp.category === "consistent-contributor" && earned && (
          <path
            d="M19 15l2 4.5 5 .5-3.7 3.4 1 4.9L19 26l-4.3 2.3 1-4.9L12 20l5-.5Z"
            fill="var(--crayon-yellow)"
            stroke="var(--ink)"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        )}
      </svg>
      {showLabel && (
        <figcaption className="flex flex-col items-center gap-0.5">
          <span className="text-sm leading-tight font-semibold">{stamp.name}</span>
          <span className="text-[11px] tracking-wide uppercase opacity-70">
            {awardedLabel ?? "Locked"}
          </span>
        </figcaption>
      )}
    </figure>
  );
}
