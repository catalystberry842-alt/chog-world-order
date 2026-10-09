import { ChogIllustration } from "@/components/ui/chog-illustration";

/** Friendly empty state used when a list or search has nothing to show. */
export function EmptyState({
  title,
  description,
  action,
  compact = false,
}: {
  title: string;
  description: React.ReactNode;
  action?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={`glass flex flex-col items-center gap-4 rounded-3xl px-6 text-center ${compact ? "py-8" : "py-14"}`}
    >
      <ChogIllustration mood="sleepy" className={compact ? "h-16 w-auto" : "h-24 w-auto"} />
      <div className="flex max-w-md flex-col gap-1.5">
        <h3 className="font-display text-lg font-semibold">{title}</h3>
        <p className="text-sm leading-relaxed text-white/65">{description}</p>
      </div>
      {action}
    </div>
  );
}

/** Error state for failed loads or unusable input. */
export function ErrorState({
  title,
  description,
  action,
}: {
  title: string;
  description: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-4 rounded-3xl border border-red-400/25 bg-red-500/[0.06] px-6 py-12 text-center"
    >
      <ChogIllustration mood="puzzled" className="h-20 w-auto" />
      <div className="flex max-w-md flex-col gap-1.5">
        <h3 className="font-display text-lg font-semibold">{title}</h3>
        <p className="text-sm leading-relaxed text-white/70">{description}</p>
      </div>
      {action}
    </div>
  );
}
