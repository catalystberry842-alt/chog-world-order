/**
 * Original crayon mascot: a round purple critter in the spirit of Chog.
 * Decorative only.
 */
export function ChogIllustration({
  className = "",
  mood = "happy",
}: {
  className?: string;
  mood?: "happy" | "puzzled" | "sleepy";
}) {
  return (
    <svg viewBox="0 0 220 200" className={className} aria-hidden="true" focusable="false">
      <g filter="url(#crayon)">
        <ellipse cx="110" cy="186" rx="62" ry="9" fill="#000" opacity="0.25" />
        {/* ears */}
        <path d="M58 62 44 22l38 24Z" fill="var(--monad-500)" />
        <path d="M162 62l14-40-38 24Z" fill="var(--monad-500)" />
        <path d="M60 52 52 32l18 12Z" fill="var(--blush-400)" />
        <path d="M160 52l8-20-18 12Z" fill="var(--blush-400)" />
        {/* body */}
        <path
          d="M110 36c46 0 78 30 80 76 2 44-30 72-80 72s-82-28-80-72c2-46 34-76 80-76Z"
          fill="var(--monad-500)"
        />
        <path
          d="M110 36c46 0 78 30 80 76 2 44-30 72-80 72s-82-28-80-72c2-46 34-76 80-76Z"
          fill="url(#crayon-hatch)"
        />
        <path d="M70 132c10 30 70 30 80 0-8 40-72 40-80 0Z" fill="var(--monad-300)" opacity="0.6" />
        {/* cheeks */}
        <ellipse cx="66" cy="118" rx="13" ry="8" fill="var(--blush-400)" />
        <ellipse cx="154" cy="118" rx="13" ry="8" fill="var(--blush-400)" />
      </g>
      <g filter="url(#crayon-line)">
        {mood === "sleepy" ? (
          <path
            d="M72 96c6 6 18 6 24 0M124 96c6 6 18 6 24 0"
            fill="none"
            stroke="var(--ink)"
            strokeWidth="5"
            strokeLinecap="round"
          />
        ) : (
          <>
            <ellipse cx="84" cy="94" rx="15" ry="18" fill="var(--paper)" />
            <ellipse cx="136" cy="94" rx="15" ry="18" fill="var(--paper)" />
            <circle cx={mood === "puzzled" ? 80 : 88} cy="98" r="8" fill="var(--ink)" />
            <circle cx={mood === "puzzled" ? 132 : 140} cy="98" r="8" fill="var(--ink)" />
            <circle cx={mood === "puzzled" ? 83 : 91} cy="94" r="2.5" fill="var(--paper)" />
            <circle cx={mood === "puzzled" ? 135 : 143} cy="94" r="2.5" fill="var(--paper)" />
          </>
        )}
        {mood === "puzzled" ? (
          <path d="M98 132c8-4 16 4 24 0" fill="none" stroke="var(--ink)" strokeWidth="5" strokeLinecap="round" />
        ) : (
          <path d="M94 128c8 12 24 12 32 0" fill="none" stroke="var(--ink)" strokeWidth="5" strokeLinecap="round" />
        )}
        {/* little arms */}
        <path d="M34 128c-10 4-14 14-8 20" fill="none" stroke="var(--ink)" strokeWidth="4" strokeLinecap="round" />
        <path d="M186 128c10 4 14 14 8 20" fill="none" stroke="var(--ink)" strokeWidth="4" strokeLinecap="round" />
      </g>
    </svg>
  );
}
