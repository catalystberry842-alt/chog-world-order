import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ApplicationPanel } from "@/components/campaigns/application-panel";
import { CampaignStatusBadge } from "@/components/campaigns/campaign-status-badge";
import { ProjectMark } from "@/components/campaigns/project-mark";
import { Badge } from "@/components/ui/badge";
import { PageContainer } from "@/components/ui/page-header";
import { SampleDataNotice } from "@/components/ui/sample-data-badge";
import { LoadingLabel } from "@/components/ui/skeletons";
import { getCampaign, getCampaignIds } from "@/lib/data";
import { formatDate, formatTokenAmount } from "@/lib/format";
import { campaignCategoryLabels } from "@/lib/labels";

export async function generateStaticParams() {
  const ids = await getCampaignIds();
  return ids.map((id) => ({ id }));
}

export async function generateMetadata({ params }: PageProps<"/collabs/[id]">): Promise<Metadata> {
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) return { title: "Campaign not found" };
  return { title: campaign.title, description: campaign.summary };
}

export default function CampaignPage({ params }: PageProps<"/collabs/[id]">) {
  return (
    <PageContainer className="gap-8 md:gap-10">
      <Link href="/collabs" className="w-fit text-sm font-medium text-white/60 hover:text-white">
        ← All campaigns
      </Link>
      <Suspense fallback={<CampaignSkeleton />}>
        <CampaignDetail params={params} />
      </Suspense>
    </PageContainer>
  );
}

async function CampaignDetail({ params }: Pick<PageProps<"/collabs/[id]">, "params">) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) notFound();

  const { budget, slots } = campaign;
  const facts = [
    {
      label: budget.model === "pool" ? "Prize pool" : "Pay per creator",
      value: formatTokenAmount(budget.model === "pool" ? budget.total : (budget.perCreator ?? budget.total), budget.token),
    },
    { label: "Total budget", value: formatTokenAmount(budget.total, budget.token) },
    { label: "Deadline", value: formatDate(campaign.deadline) },
    { label: "Slots", value: `${slots.total - slots.filled} of ${slots.total} open` },
    { label: "Applicants", value: String(campaign.applicants) },
    { label: "Min. reputation", value: campaign.minReputation > 0 ? `${campaign.minReputation}+` : "None" },
  ];

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
      <article className="flex min-w-0 flex-col gap-8">
        <header className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-3">
            <ProjectMark project={campaign.project} size="lg" />
            <div>
              <p className="font-medium">{campaign.project.name}</p>
              <p className="text-sm text-white/50">@{campaign.project.handle}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <CampaignStatusBadge status={campaign.status} />
            <Badge tone="purple">{campaignCategoryLabels[campaign.category]}</Badge>
            <Badge>Posted {formatDate(campaign.postedOn)}</Badge>
          </div>
          <h1 className="text-3xl leading-tight font-semibold tracking-tight text-balance md:text-5xl">
            {campaign.title}
          </h1>
          <p className="text-lg leading-relaxed text-white/70">{campaign.summary}</p>
          <a href="#apply" className="btn btn-primary w-full sm:w-fit lg:hidden">
            {campaign.status === "open" ? "Apply now" : "View application status"}
          </a>
        </header>

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {facts.map((fact) => (
            <div key={fact.label} className="glass rounded-2xl px-4 py-3">
              <dt className="text-xs text-white/50">{fact.label}</dt>
              <dd className="mt-0.5 text-lg font-semibold">{fact.value}</dd>
            </div>
          ))}
        </dl>

        <SampleDataNotice>
          This is a sample campaign. {campaign.project.name} is fictional, and the budget is not funded or held in
          escrow. Payments will be handled by an audited escrow contract in a later phase.
        </SampleDataNotice>

        <section aria-labelledby="about-heading" className="flex flex-col gap-3">
          <h2 id="about-heading" className="text-xl font-semibold">
            About the campaign
          </h2>
          {campaign.description.map((paragraph) => (
            <p key={paragraph} className="leading-relaxed text-white/70">
              {paragraph}
            </p>
          ))}
        </section>

        <div className="grid gap-4 md:grid-cols-2">
          <section aria-labelledby="deliverables-heading" className="glass rounded-3xl p-5">
            <h2 id="deliverables-heading" className="text-lg font-semibold">
              Deliverables
            </h2>
            <ul className="mt-3 flex flex-col gap-2.5">
              {campaign.deliverables.map((item) => (
                <li key={item} className="flex gap-3 text-sm leading-relaxed text-white/75">
                  <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blush-400" />
                  {item}
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="requirements-heading" className="glass rounded-3xl p-5">
            <h2 id="requirements-heading" className="text-lg font-semibold">
              Requirements
            </h2>
            <ul className="mt-3 flex flex-col gap-2.5">
              {campaign.requirements.map((item) => (
                <li key={item} className="flex gap-3 text-sm leading-relaxed text-white/75">
                  <span aria-hidden="true" className="mt-0.5 text-crayon-mint">
                    ✓
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section aria-labelledby="process-heading" className="flex flex-col gap-4">
          <h2 id="process-heading" className="text-xl font-semibold">
            How payment works
          </h2>
          <ol className="grid gap-3 sm:grid-cols-4">
            {[
              ["Apply", "Send a pitch with your passport attached."],
              ["Get selected", "The project picks creators for each slot."],
              ["Submit work", "Deliver before the deadline."],
              ["Get paid", "Accepted work is paid in " + budget.token + "."],
            ].map(([title, copy], index) => (
              <li key={title} className="rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/[0.06]">
                <span className="text-sm font-semibold text-blush-300 tabular-nums">0{index + 1}</span>
                <h3 className="font-medium">{title}</h3>
                <p className="mt-1 text-sm text-white/55">{copy}</p>
              </li>
            ))}
          </ol>
        </section>

        <div className="flex flex-wrap gap-1.5">
          {campaign.tags.map((tag) => (
            <Badge key={tag}>#{tag}</Badge>
          ))}
        </div>
      </article>

      <aside id="apply" className="scroll-mt-24 lg:sticky lg:top-24">
        <ApplicationPanel campaign={campaign} />
      </aside>
    </div>
  );
}

function CampaignSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]" aria-hidden="true">
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <div className="skeleton h-14 w-14 rounded-2xl" />
          <div className="skeleton h-5 w-40" />
        </div>
        <div className="skeleton h-12 w-4/5" />
        <div className="skeleton h-5 w-full" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="skeleton h-16" />
          ))}
        </div>
        <div className="skeleton h-32 w-full" />
      </div>
      <div className="skeleton h-96" />
      <LoadingLabel>Loading campaign…</LoadingLabel>
    </div>
  );
}
