import type { StampMotif } from "@/lib/types";

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
    case "chog":
      return (
        <g>
          <path
            d="M50 24c14 0 26 9 27 24 2 15-8 28-27 28S21 63 23 48c1-15 13-24 27-24Z"
            {...line}
            fill={paper}
          />
          <path d="M33 30l-4-9 10 5M67 30l4-9-10 5" {...line} />
          <ellipse cx="41" cy="47" rx="5" ry="6" fill={ink} />
          <ellipse cx="59" cy="47" rx="5" ry="6" fill={ink} />
          <circle cx="42.5" cy="45" r="1.6" fill={paper} />
          <circle cx="60.5" cy="45" r="1.6" fill={paper} />
          <ellipse cx="33" cy="57" rx="4.5" ry="2.6" fill="var(--blush-400)" />
          <ellipse cx="67" cy="57" rx="4.5" ry="2.6" fill="var(--blush-400)" />
          <path d="M44 59c3 4 9 4 12 0" {...line} />
        </g>
      );
    case "code":
      return (
        <g>
          <path d="M37 34 22 50l15 16M63 34l15 16-15 16M55 28 45 72" {...line} strokeWidth={4.2} />
        </g>
      );
    case "brush":
      return (
        <g>
          <path d="M70 24 46 52" {...line} strokeWidth={5} />
          <path d="M46 52c-6-2-13 2-14 9-1 6-4 9-8 11 9 3 20 1 24-6 3-5 2-10-2-14Z" {...line} fill={paper} />
          <path d="M28 76c6 0 12-2 15-5" {...line} strokeWidth={2.4} />
        </g>
      );
    case "quill":
      return (
        <g>
          <path d="M74 22C52 26 36 42 30 70c18-4 34-18 44-48Z" {...line} fill={paper} />
          <path d="M30 70 66 32M44 54h10M38 62h9" {...line} strokeWidth={2.6} />
          <path d="M24 78l6-8" {...line} />
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
    case "star":
      return (
        <path
          d="M50 22l8 17 18 2-13 13 4 18-17-9-17 9 4-18-13-13 18-2Z"
          {...line}
          fill={paper}
        />
      );
    case "lightning":
      return <path d="M56 20 30 54h17l-5 26 28-36H52Z" {...line} fill={paper} />;
    case "heart":
      return (
        <g>
          <path
            d="M50 76S24 60 24 42c0-9 7-15 14-15 6 0 10 3 12 8 2-5 6-8 12-8 7 0 14 6 14 15 0 18-26 34-26 34Z"
            {...line}
            fill={paper}
          />
          <path d="M36 40c1-3 3-5 6-5" {...line} strokeWidth={2.4} />
        </g>
      );
  }
}
