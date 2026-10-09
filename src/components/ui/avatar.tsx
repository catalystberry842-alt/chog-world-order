const sizeClass = {
  sm: "h-9 w-9 text-xs",
  md: "h-12 w-12 text-sm",
  lg: "h-20 w-20 text-2xl",
} as const;

/** Generated avatar: a flat colour from a hue plus initials. No uploads yet. */
export function Avatar({
  name,
  hue,
  size = "md",
  className = "",
}: {
  name: string;
  hue: number;
  size?: keyof typeof sizeClass;
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-2xl font-semibold text-white ring-1 ring-white/15 ${sizeClass[size]} ${className}`}
      style={{
        background: `hsl(${hue} 45% 42%)`,
      }}
    >
      {initials}
    </span>
  );
}
