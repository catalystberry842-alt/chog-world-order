import type { StampMotif } from "@/lib/passport/stamps";

const ink = "var(--ink)";
const paper = "var(--paper)";

const line = {
  fill: "none",
  stroke: ink,
  strokeWidth: 3.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** Ink drawings for each stamp motif, in a 100×100 coordinate space. */
export function StampMotifArt({ motif }: { motif: StampMotif }) {
  switch (motif) {
    case "compass":
      return (
        <g>
          <circle cx="50" cy="50" r="27" {...line} fill={paper} />
          <path d="M50 27v6M50 67v6M27 50h6M67 50h6" {...line} strokeWidth={2.6} />
          <path d="M58 38 46 46l-4 16 12-8Z" {...line} fill="var(--blush-400)" />
          <circle cx="50" cy="50" r="2.6" fill={ink} />
        </g>
      );
    case "calendar":
      return (
        <g>
          <rect x="24" y="28" width="52" height="48" rx="8" {...line} fill={paper} />
          <path d="M24 42h52M37 22v12M63 22v12" {...line} />
          <path d="M33 54l4 4 7-8M47 54l4 4 7-8M61 54l4 4 7-8M33 66l4 4 7-8" {...line} strokeWidth={2.6} />
        </g>
      );
    case "code":
      return (
        <g>
          <path d="M37 34 22 50l15 16M63 34l15 16-15 16M55 28 45 72" {...line} strokeWidth={4.2} />
        </g>
      );
    case "megaphone":
      return (
        <g>
          <path d="M26 44v14l10 2 34 14V28L36 42Z" {...line} fill={paper} />
          <path d="M36 60l4 14h8l-3-12" {...line} />
          <path d="M78 42c3 3 3 9 0 13M83 36c6 7 6 18 0 25" {...line} strokeWidth={2.8} />
        </g>
      );
    case "lens":
      return (
        <g>
          <circle cx="44" cy="44" r="17" {...line} fill={paper} />
          <path d="M57 57l17 17" {...line} strokeWidth={6} />
          <path d="M35 40c2-5 6-8 11-8" {...line} strokeWidth={2.4} />
        </g>
      );
    case "links":
      return (
        <g>
          <rect x="20" y="38" width="36" height="24" rx="12" {...line} />
          <rect x="44" y="38" width="36" height="24" rx="12" {...line} />
          <circle cx="50" cy="50" r="3" fill={ink} />
        </g>
      );
  }
}
