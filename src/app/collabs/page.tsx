import type { Metadata } from "next";
import { PageFrame } from "@/components/page-frame";
import { sampleBriefs } from "@/lib/placeholders";

export const metadata: Metadata = {
  title: "Collabs",
  description: "Placeholder board for paid Monad collaborations.",
};

export default function CollabsPage() {
  return (
    <PageFrame
      kicker="Paid collaborations"
      title="Work with a price on it."
      summary="Collabs will match a brief with a contributor. These cards are sample copy only. Nothing is funded, escrowed, or assigned."
    >
      <ul className="grid gap-4 md:grid-cols-3">
        {sampleBriefs.map((brief) => (
          <li key={brief.title} className="stamp-card flex flex-col gap-3 p-5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold tracking-widest text-crayon uppercase">
                {brief.craft}
              </span>
              <span className="rounded-full bg-pink px-3 py-1 text-xs font-semibold text-ink">
                {brief.status}
              </span>
            </div>
            <h2 className="text-xl font-semibold leading-tight">{brief.title}</h2>
            <p className="leading-relaxed text-ink/80">{brief.note}</p>
            <p className="text-sm font-semibold text-ink/70">Sample brief · not funded</p>
          </li>
        ))}
      </ul>
    </PageFrame>
  );
}
