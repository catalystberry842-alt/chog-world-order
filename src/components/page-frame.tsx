export function PageFrame({
  kicker,
  title,
  summary,
  children,
}: {
  kicker: string;
  title: string;
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-8 md:py-12">
      <header className="flex max-w-2xl flex-col gap-3">
        <p className="text-xs font-semibold tracking-widest text-crayon uppercase">
          {kicker}
        </p>
        <h1 className="text-4xl font-semibold leading-none tracking-tight md:text-5xl">
          {title}
        </h1>
        <p className="text-lg leading-relaxed text-ink/80">{summary}</p>
        <p className="inline-flex w-fit items-center rounded-full bg-pink px-3 py-1 text-sm font-semibold text-ink">
          Placeholder · nothing on-chain yet
        </p>
      </header>
      {children}
    </div>
  );
}
