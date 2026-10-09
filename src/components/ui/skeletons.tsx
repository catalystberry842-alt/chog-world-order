/** Loading placeholders shaped like the content they stand in for. */
export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="glass flex flex-col gap-4 rounded-3xl p-5">
          <div className="flex items-center gap-3">
            <div className="skeleton h-10 w-10" />
            <div className="skeleton h-4 w-28" />
          </div>
          <div className="skeleton h-5 w-4/5" />
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-2/3" />
          <div className="skeleton mt-2 h-9 w-full" />
        </div>
      ))}
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-hidden="true">
      <div className="glass flex flex-col gap-5 rounded-3xl p-6 sm:flex-row sm:items-center">
        <div className="skeleton h-20 w-20 rounded-2xl" />
        <div className="flex flex-1 flex-col gap-3">
          <div className="skeleton h-7 w-48" />
          <div className="skeleton h-4 w-64" />
          <div className="skeleton h-4 w-40" />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="skeleton h-40 md:col-span-2" />
        <div className="skeleton h-40" />
      </div>
    </div>
  );
}

export function LoadingLabel({ children = "Loading…" }: { children?: React.ReactNode }) {
  return (
    <p role="status" className="sr-only">
      {children}
    </p>
  );
}
