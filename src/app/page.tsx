import Link from "next/link";
import { CrayonMark } from "@/components/crayon-mark";

const notes = [
  {
    href: "/passport",
    kicker: "01",
    title: "Chog Passport",
    copy: "A public notebook tied to an address. Proof someone showed up, not a login wall.",
  },
  {
    href: "/leaderboard",
    kicker: "02",
    title: "Reputation",
    copy: "Contribution stacked in the open, so the loudest account is not the only record.",
  },
  {
    href: "/collabs",
    kicker: "03",
    title: "Paid collabs",
    copy: "Briefs for illustrators, writers, and builders who want to be paid for the work.",
  },
] as const;

const steps = [
  {
    title: "Carry a passport",
    copy: "An address becomes the cover. Names and stamps come later.",
  },
  {
    title: "Leave a trail",
    copy: "Reviews, sketches, and shipped notes turn into a reputation.",
  },
  {
    title: "Take the work",
    copy: "Open collaborations sit beside the people who can actually do them.",
  },
] as const;

export default function HomePage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-5 py-8 md:gap-14 md:py-12">
      <section className="grid items-center gap-8 md:grid-cols-[1.35fr_0.65fr]">
        <div className="flex flex-col gap-5">
          <p className="text-xs font-semibold tracking-widest text-crayon uppercase">
            Monad contribution economy
          </p>
          <h1 className="max-w-xl text-5xl font-semibold leading-none tracking-tight md:text-7xl">
            Chog World <span className="mark">Order</span>
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-ink/80">
            Passport, reputation, and paid collaborations for people building
            in the Monad ecosystem. The order is the work.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link className="btn btn-primary" href="/passport">
              Open the passport
            </Link>
            <Link className="btn btn-secondary" href="/collabs">
              See collabs
            </Link>
          </div>
        </div>
        <aside className="stamp-card mx-auto flex w-full max-w-xs flex-col items-center gap-3 px-6 py-7">
          <CrayonMark className="h-36 w-36" />
          <p className="text-center text-sm font-semibold">Field stamp 001</p>
          <p className="text-center text-sm leading-relaxed text-ink/75">
            Show up. Get remembered. Get paid.
          </p>
        </aside>
      </section>

      <section aria-label="What this is" className="grid gap-4 md:grid-cols-3">
        {notes.map((note) => (
          <Link key={note.href} href={note.href} className="stamp-card flex flex-col gap-3 p-5">
            <span className="text-sm font-semibold text-crayon">{note.kicker}</span>
            <h2 className="text-2xl font-semibold leading-tight">{note.title}</h2>
            <p className="leading-relaxed text-ink/80">{note.copy}</p>
          </Link>
        ))}
      </section>

      <section className="lined stamp-card px-6 py-7" aria-labelledby="how-heading">
        <h2 id="how-heading" className="text-2xl font-semibold">
          How the order works
        </h2>
        <ol className="mt-6 grid gap-6 md:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="flex flex-col gap-2">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-pink text-sm font-semibold text-ink">
                0{index + 1}
              </span>
              <h3 className="text-lg font-semibold">{step.title}</h3>
              <p className="leading-relaxed text-ink/80">{step.copy}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
