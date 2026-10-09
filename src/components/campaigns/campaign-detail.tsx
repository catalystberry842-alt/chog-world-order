import { CampaignStatusBadge, RegistrationBadge } from "@/components/campaigns/campaign-status-badge";
import { CreatorPanel } from "@/components/campaigns/creator-panel";
import { ProjectMark } from "@/components/campaigns/project-mark";
import { EvidenceReference } from "@/components/evidence/evidence-reference";
import { Badge } from "@/components/ui/badge";
import { SampleDataNotice } from "@/components/ui/sample-data-badge";
import { formatTokenUnits } from "@/lib/collabs/rules";
import { paymentTokens } from "@/lib/collabs/tokens";
import type { CampaignView } from "@/lib/collabs/types";
import { formatDate } from "@/lib/format";
import { campaignCategoryLabels } from "@/lib/labels";

const hueFor = (text: string) => [...text].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360;

function ListSection({ id, title, items, marker }: { id: string; title: string; items: string[]; marker: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="glass rounded-3xl p-5">
      <h2 id={id} className="text-lg font-semibold">
        {title}
      </h2>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-white/45">None listed.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2.5">
          {items.map((item) => (
            <li key={item} className="flex gap-3 text-sm leading-relaxed text-white/75">
              <span aria-hidden="true" className="mt-0.5 shrink-0">
                {marker}
              </span>
              {item}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Full campaign brief: objectives, deliverables, eligibility, budget, deadline, acceptance criteria. */
export function CampaignDetail({ campaign }: { campaign: CampaignView }) {
  const token = paymentTokens[campaign.paymentToken];
  const perCreator = BigInt(campaign.amountPerCreator);
  const facts = [
    { label: "Pay per creator", value: formatTokenUnits(perCreator, token) },
    { label: "Total budget", value: formatTokenUnits(perCreator * BigInt(campaign.slots.total), token) },
    { label: "Payment token", value: token.address ? `${token.symbol} (ERC-20)` : `${token.symbol} (native)` },
    { label: "Deadline", value: formatDate(campaign.deadline) },
    { label: "Slots", value: `${campaign.slots.total - campaign.slots.filled} of ${campaign.slots.total} open` },
    { label: "Applicants", value: String(campaign.applicants) },
  ];

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
      <article className="flex min-w-0 flex-col gap-8">
        <header className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-3">
            <ProjectMark project={{ name: campaign.projectName, handle: "", hue: hueFor(campaign.projectName) }} size="lg" />
            <div className="min-w-0">
              <p className="font-medium">{campaign.projectName}</p>
              {campaign.ownerAddress ? (
                <p className="text-xs text-white/55">
                  Owner wallet (verified by sign-in):{" "}
                  <span className="font-mono break-all text-white/75">{campaign.ownerAddress}</span>
                </p>
              ) : (
                <p className="text-xs text-white/45">Sample project · no wallet</p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <CampaignStatusBadge status={campaign.status} />
            <Badge tone="purple">{campaignCategoryLabels[campaign.category]}</Badge>
            {campaign.source === "database" && <RegistrationBadge status={campaign.registration.status} />}
            {campaign.publishedAt && <Badge>Posted {formatDate(campaign.publishedAt)}</Badge>}
          </div>
          <h1 className="text-3xl leading-tight font-semibold tracking-tight text-balance md:text-5xl">{campaign.title}</h1>
          <p className="text-lg leading-relaxed text-white/70">{campaign.summary}</p>
          <a href="#apply" className="btn btn-primary w-full sm:w-fit lg:hidden">
            {campaign.status === "published" ? "Apply now" : "View status"}
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

        {campaign.source === "mock" ? (
          <SampleDataNotice>
            Sample campaign. {campaign.projectName} is fictional and the budget is not funded.
          </SampleDataNotice>
        ) : (
          <p className="rounded-2xl bg-white/[0.04] px-4 py-3 text-sm leading-relaxed text-white/65">
            Payments go directly from the project&apos;s wallet to the creator after the work is accepted. There is no
            escrow: the budget is a commitment by the project, not funds held by Chog World Order.
            {campaign.registration.txHash && (
              <>
                {" "}
                Registration transaction:{" "}
                <EvidenceReference
                  reference={{
                    label: `${campaign.registration.txHash.slice(0, 10)}…`,
                    url: `https://monadscan.com/tx/${campaign.registration.txHash}`,
                    txHash: campaign.registration.txHash,
                    chainId: 143,
                  }}
                />
              </>
            )}
          </p>
        )}

        <section aria-labelledby="about-heading" className="flex flex-col gap-3">
          <h2 id="about-heading" className="text-xl font-semibold">
            About the campaign
          </h2>
          {campaign.description.split(/\n{2,}/).map((paragraph) => (
            <p key={paragraph} className="leading-relaxed whitespace-pre-line text-white/70">
              {paragraph}
            </p>
          ))}
        </section>

        <div className="grid gap-4 md:grid-cols-2">
          <ListSection id="objectives-heading" title="Objectives" items={campaign.objectives} marker={<span className="text-blush-300">•</span>} />
          <ListSection id="deliverables-heading" title="Deliverables" items={campaign.deliverables} marker={<span className="text-blush-300">•</span>} />
          <ListSection id="eligibility-heading" title="Eligibility" items={campaign.eligibility} marker={<span className="text-crayon-mint">✓</span>} />
          <ListSection
            id="criteria-heading"
            title="Acceptance criteria"
            items={campaign.acceptanceCriteria}
            marker={<span className="text-crayon-mint">✓</span>}
          />
        </div>

        {campaign.requiredSkills.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Required skills">
            {campaign.requiredSkills.map((skill) => (
              <li key={skill}>
                <Badge>{skill}</Badge>
              </li>
            ))}
          </ul>
        )}
      </article>

      <aside id="apply" className="scroll-mt-24 lg:sticky lg:top-24">
        <CreatorPanel campaign={campaign} />
      </aside>
    </div>
  );
}
