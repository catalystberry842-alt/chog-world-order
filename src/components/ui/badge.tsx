type Tone = "purple" | "pink" | "mint" | "yellow" | "neutral" | "danger";

const toneClass: Record<Tone, string> = {
  purple: "border-monad-400/30 bg-monad-500/15 text-monad-200",
  pink: "border-blush-400/30 bg-blush-400/15 text-blush-300",
  mint: "border-crayon-mint/30 bg-crayon-mint/10 text-crayon-mint",
  yellow: "border-crayon-yellow/30 bg-crayon-yellow/10 text-crayon-yellow",
  neutral: "border-white/10 bg-white/5 text-white/70",
  danger: "border-red-400/30 bg-red-400/10 text-red-300",
};

export function Badge({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${toneClass[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
