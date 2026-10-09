import Link from "next/link";
import { CampaignStatusBadge } from "@/components/campaigns/campaign-status-badge";
import { ProjectMark } from "@/components/campaigns/project-mark";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatTokenAmount } from "@/lib/format";
import { campaignCategoryLabels } from "@/lib/labels";
import type { Campaign } from "@/lib/types";

/** Summary card for a Collab Board campaign. The whole card links to its detail page. */
export function CampaignCard({ campaign }: { campaign: Campaign }) {
  const { budget, slots } = campaign;
  const slotsLeft = slots.total - slots.filled;
  const fill = Math.round((slots.filled / slots.total) * 100);

  return (
    <article className="glass group relative flex h-full flex-col gap-4 rounded-3xl p-5 transition hover:-translate-y-0.5 hover:border-monad-400/40 motion-reduce:transition-none">
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <ProjectMark project={campaign.project} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white/85">{campaign.project.name}</p>
            <p className="text-xs text-white/50">{campaignCategoryLabels[campaign.category]}</p>
          </div>
        </div>
        <CampaignStatusBadge status={campaign.status} />
      </header>

      <div className="flex flex-col gap-2">
        <h3 className="text-lg leading-snug font-semibold">
          <Link href={`/collabs/${campaign.id}`} className="after:absolute after:inset-0 after:rounded-3xl">
            {campaign.title}
          </Link>
        </h3>
        <p className="line-clamp-2 text-sm leading-relaxed text-white/65">{campaign.summary}</p>
      </div>

      <div className="mt-auto flex flex-col gap-4">
        <div className="flex items-end justify-between gap-3 rounded-2xl bg-night-950/40 px-4 py-3 ring-1 ring-white/[0.06]">
          <div>
            <p className="text-xs text-white/50">{budget.model === "pool" ? "Prize pool" : "Per creator"}</p>
            <p className="text-xl font-semibold">
              {formatTokenAmount(budget.model === "pool" ? budget.total : (budget.perCreator ?? budget.total), budget.token)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-white/50">Deadline</p>
            <p className="text-sm font-medium">
              <time dateTime={campaign.deadline}>{formatDate(campaign.deadline)}</time>
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-xs text-white/55">
            <span>
              {slotsLeft > 0 ? `${slotsLeft} of ${slots.total} slots open` : "All slots filled"}
            </span>
            <span>{campaign.applicants} applicants</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden="true">
            <div className="h-full rounded-full bg-monad-400" style={{ width: `${fill}%` }} />
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {campaign.minReputation > 0 && <Badge tone="purple">{campaign.minReputation}+ reputation</Badge>}
          {campaign.tags.slice(0, 3).map((tag) => (
            <Badge key={tag}>#{tag}</Badge>
          ))}
        </div>
      </div>
    </article>
  );
}
