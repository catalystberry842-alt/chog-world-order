export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  badges,
}: {
  eyebrow: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  badges?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
      <div className="flex max-w-2xl flex-col gap-3">
        <p className="text-xs font-semibold tracking-[0.2em] text-blush-300 uppercase">{eyebrow}</p>
        <h1 className="font-display text-4xl leading-[1.05] font-semibold tracking-tight text-balance md:text-5xl">
          {title}
        </h1>
        {description && <p className="text-base leading-relaxed text-white/70 md:text-lg">{description}</p>}
        {badges && <div className="flex flex-wrap gap-2">{badges}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </header>
  );
}

export function SectionHeading({
  title,
  description,
  action,
  id,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  id?: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h2 id={id} className="font-display text-xl font-semibold tracking-tight md:text-2xl">
          {title}
        </h2>
        {description && <p className="text-sm text-white/60">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageContainer({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-10 sm:px-6 md:gap-14 md:py-14 ${className}`}>
      {children}
    </div>
  );
}
