import type { Metadata } from "next";
import Link from "next/link";
import { PageFrame } from "@/components/page-frame";
import { passportFields, sampleContributors } from "@/lib/placeholders";
import { shortAddress } from "@/lib/site";

export const metadata: Metadata = {
  title: "Passport",
  description: "Placeholder for the Chog Passport, a public contributor record.",
};

export default function PassportPage() {
  const sample = sampleContributors[0];

  return (
    <PageFrame
      kicker="Chog Passport"
      title="A cover, not a login."
      summary="The passport will be a public sheet for a wallet address: who they are in the order, what they shipped, and which collabs they finished."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <section className="stamp-card p-5">
          <h2 className="text-xl font-semibold">Sheet fields</h2>
          <ul className="mt-4 grid gap-3">
            {passportFields.map((field) => (
              <li
                key={field}
                className="flex items-center justify-between gap-4 border-b border-pink/50 pb-3 text-sm last:border-b-0 last:pb-0"
              >
                <span className="font-semibold">{field}</span>
                <span className="text-ink/70">Not issued</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="stamp-card flex flex-col gap-4 p-5">
          <h2 className="text-xl font-semibold">Sample cover</h2>
          <p className="leading-relaxed text-ink/80">
            {sample.name} is placeholder ink. Opening their profile shows the
            shape of a future passport, not a live record.
          </p>
          <p className="font-semibold">{shortAddress(sample.address)}</p>
          <Link className="btn btn-primary w-fit" href={`/profile/${sample.address}`}>
            View sample profile
          </Link>
        </section>
      </div>
    </PageFrame>
  );
}
