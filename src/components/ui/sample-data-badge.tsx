import { Badge } from "@/components/ui/badge";

/** Marks any surface that shows mock data. Use it wherever mock data renders. */
export function SampleDataBadge({ label = "Sample data" }: { label?: string }) {
  return (
    <Badge tone="yellow">
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-crayon-yellow" />
      {label}
    </Badge>
  );
}

export function SampleDataNotice({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-3 rounded-2xl border border-crayon-yellow/25 bg-crayon-yellow/[0.07] px-4 py-3 text-sm leading-relaxed text-crayon-yellow/90">
      <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-crayon-yellow" />
      <span>{children}</span>
    </p>
  );
}
