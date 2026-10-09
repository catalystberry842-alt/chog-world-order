export function CrayonMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 200"
      className={className}
      role="img"
      aria-label="Crayon stamp"
    >
      <path
        fill="var(--crayon)"
        d="M100 16c28-4 62 10 78 38 16 28 18 62 4 90-14 28-46 48-82 46-34-2-66-22-78-52C8 102 14 52 42 30 58 16 78 18 100 16Z"
      />
      <ellipse cx="74" cy="92" rx="16" ry="18" fill="var(--card)" />
      <ellipse cx="128" cy="90" rx="16" ry="18" fill="var(--card)" />
      <circle cx="78" cy="96" r="6" fill="var(--ink)" />
      <circle cx="132" cy="94" r="6" fill="var(--ink)" />
      <ellipse cx="58" cy="118" rx="10" ry="6" fill="var(--pink)" />
      <ellipse cx="146" cy="116" rx="10" ry="6" fill="var(--pink)" />
      <path
        d="M78 128c8 12 34 14 48 2"
        fill="none"
        stroke="var(--ink)"
        strokeWidth="5"
        strokeLinecap="round"
      />
    </svg>
  );
}
