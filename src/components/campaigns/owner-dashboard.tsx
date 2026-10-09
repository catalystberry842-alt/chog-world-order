"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CampaignForm } from "@/components/campaigns/campaign-form";
import { CampaignStatusBadge, RegistrationBadge } from "@/components/campaigns/campaign-status-badge";
import { DeliverableHistory } from "@/components/campaigns/deliverable-history";
import { PaymentPanel, RegistrationPanel } from "@/components/campaigns/onchain-actions";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState } from "@/components/ui/state-panels";
import { ConnectButton } from "@/components/wallet/connect-button";
import { usePassportSession } from "@/components/wallet/use-passport-session";
import { useWallet } from "@/components/wallet/use-wallet";
import { ApiError } from "@/lib/client/passport-api";
import { collabsApi, type CampaignFormInput, type DashboardEntry } from "@/lib/client/collabs-api";
import { formatTokenUnits } from "@/lib/collabs/rules";
import { paymentTokens } from "@/lib/collabs/tokens";
import { paymentsContractConfig } from "@/lib/contracts/campaign-payments";
import type { ApplicationView, DeliverableView } from "@/lib/collabs/types";
import { formatDate, shortAddress } from "@/lib/format";

const errorText = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong.");

/** On-chain registration and payments are on when the contract address is configured. */
const onchain = paymentsContractConfig().enabled;

/** Project owner's dashboard: drafts, publication, applications, and deliverable reviews. */
export function OwnerDashboard({ children }: { children?: React.ReactNode }) {
  const { address, status } = useWallet();
  const { signedIn, signIn, session } = usePassportSession(address);

  if (status === "reconnecting") return <div className="skeleton h-40 w-full" aria-hidden="true" />;
  if (status !== "connected" || !address) {
    return (
      <section className="glass flex flex-col items-start gap-4 rounded-3xl p-6">
        <h2 className="text-xl font-semibold">Connect the project wallet</h2>
        <p className="text-sm text-white/65">
          Campaigns belong to the wallet that creates them. Payments to creators are later sent from this wallet.
        </p>
        <ConnectButton />
        {children}
      </section>
    );
  }
  if (!signedIn) {
    return (
      <section className="glass flex flex-col items-start gap-4 rounded-3xl p-6">
        <h2 className="text-xl font-semibold">Sign in to manage campaigns</h2>
        <p className="text-sm text-white/65">A free signature proves you own {shortAddress(address)}. No transaction, no gas.</p>
        <button type="button" className="btn btn-primary" disabled={signIn.isPending || session.isLoading} onClick={() => signIn.mutate()}>
          {signIn.isPending ? "Check your wallet…" : "Sign in"}
        </button>
        {signIn.error && (
          <p role="alert" className="text-sm text-red-300">
            {errorText(signIn.error)}
          </p>
        )}
      </section>
    );
  }
  return <Dashboard address={address} />;
}

function Dashboard({ address }: { address: string }) {
  const queryClient = useQueryClient();
  const key = ["dashboard", address.toLowerCase()];
  const dashboard = useQuery({ queryKey: key, queryFn: collabsApi.dashboard, retry: false });
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });
  const [editing, setEditing] = useState<"new" | string | null>(null);

  const save = useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: CampaignFormInput }) =>
      id ? collabsApi.update(id, input) : collabsApi.create(input),
    onSuccess: () => {
      setEditing(null);
      refresh();
    },
  });

  if (dashboard.isPending) return <div className="skeleton h-40 w-full" aria-hidden="true" />;
  if (dashboard.isError) {
    const notConfigured = dashboard.error instanceof ApiError && dashboard.error.status === 503;
    return (
      <ErrorState
        title={notConfigured ? "The Collab Board isn't available here" : "Couldn't load your campaigns"}
        description={notConfigured ? "This deployment has no database configured, so campaigns cannot be created." : errorText(dashboard.error)}
        action={
          notConfigured ? undefined : (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => dashboard.refetch()}>
              Try again
            </button>
          )
        }
      />
    );
  }

  const entries = dashboard.data.campaigns;
  const editingEntry = entries.find((entry) => entry.campaign.id === editing);

  return (
    <div className="flex flex-col gap-6">
      {editing ? (
        <CampaignForm
          key={editing}
          campaign={editingEntry?.campaign}
          pending={save.isPending}
          error={save.error ? errorText(save.error) : null}
          onSubmit={(input) => save.mutate({ id: editing === "new" ? null : editing, input })}
          onCancel={() => {
            save.reset();
            setEditing(null);
          }}
        />
      ) : (
        <button type="button" className="btn btn-primary w-fit" onClick={() => setEditing("new")}>
          New campaign
        </button>
      )}

      {entries.length === 0 && !editing ? (
        <EmptyState title="No campaigns yet" description="Create a draft, add deliverables and acceptance criteria, then publish it." />
      ) : (
        entries.map((entry) => (
          <CampaignManager key={entry.campaign.id} entry={entry} ownerAddress={address} onEdit={() => setEditing(entry.campaign.id)} onChanged={refresh} />
        ))
      )}
    </div>
  );
}

function CampaignManager({
  entry,
  ownerAddress,
  onEdit,
  onChanged,
}: {
  entry: DashboardEntry;
  ownerAddress: string;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const { campaign, applications, deliverables, payments } = entry;
  const registering = campaign.registration.status === "pending";
  const publish = useMutation({ mutationFn: () => collabsApi.publish(campaign.id), onSuccess: onChanged });
  const token = paymentTokens[campaign.paymentToken];

  return (
    <article className="glass flex flex-col gap-5 rounded-3xl p-5 sm:p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <CampaignStatusBadge status={campaign.status} />
            {(campaign.status !== "draft" || campaign.registration.status !== "not-registered") && (
              <RegistrationBadge status={campaign.registration.status} />
            )}
          </div>
          <h2 className="text-xl font-semibold">{campaign.title}</h2>
          <p className="text-sm text-white/55">
            {formatTokenUnits(campaign.amountPerCreator, token)} per creator · {campaign.slots.filled}/{campaign.slots.total} slots ·
            deadline {formatDate(campaign.deadline)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {campaign.status === "draft" && !registering && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onEdit}>
              Edit
            </button>
          )}
          {campaign.status === "draft" && !onchain && (
            <button type="button" className="btn btn-primary btn-sm" disabled={publish.isPending} onClick={() => publish.mutate()}>
              {publish.isPending ? "Publishing…" : "Publish"}
            </button>
          )}
          {campaign.status !== "draft" && (
            <Link href={`/collabs/${campaign.id}`} className="btn btn-ghost btn-sm">
              View public page
            </Link>
          )}
        </div>
      </header>
      {publish.error && (
        <p role="alert" className="rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {errorText(publish.error)}
        </p>
      )}

      {campaign.status === "draft" && onchain && <RegistrationPanel campaign={campaign} ownerAddress={ownerAddress} onChanged={onChanged} />}

      {campaign.status !== "draft" && (
        <>
          <section className="flex flex-col gap-3" aria-label="Applications">
            <h3 className="font-medium">Applications ({applications.length})</h3>
            {applications.length === 0 ? (
              <p className="text-sm text-white/45">No applications yet.</p>
            ) : (
              applications.map((app) => <ApplicationRow key={app.id} application={app} onChanged={onChanged} />)
            )}
          </section>
          <section className="flex flex-col gap-3" aria-label="Deliverables">
            <h3 className="font-medium">Deliverables ({deliverables.length})</h3>
            {deliverables.length === 0 ? (
              <p className="text-sm text-white/45">No submissions yet.</p>
            ) : (
              <>
                {deliverables
                  .filter((item) => item.status === "submitted")
                  .map((item) => (
                    <DeliverableReviewForm key={item.id} deliverable={item} onChanged={onChanged} />
                  ))}
                <DeliverableHistory deliverables={deliverables} />
              </>
            )}
          </section>
          {onchain && deliverables.some((item) => item.status === "accepted") && (
            <section className="flex flex-col gap-3" aria-label="Payments">
              <h3 className="font-medium">Payments</h3>
              {deliverables
                .filter((item) => item.status === "accepted")
                .map((item) => (
                  <PaymentPanel
                    key={item.id}
                    deliverableId={item.id}
                    ownerAddress={ownerAddress}
                    payment={payments.find((payment) => payment.deliverableId === item.id) ?? null}
                    onChanged={onChanged}
                  />
                ))}
            </section>
          )}
        </>
      )}
    </article>
  );
}

function DecisionForm({
  label,
  pending,
  error,
  onDecide,
}: {
  label: string;
  pending: boolean;
  error: unknown;
  onDecide: (decision: "accept" | "reject", reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-white/70">{label}</span>
        <input className="field" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Recorded with your decision" />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary btn-sm" disabled={pending || reason.trim().length < 3} onClick={() => onDecide("accept", reason)}>
          Accept
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={pending || reason.trim().length < 3} onClick={() => onDecide("reject", reason)}>
          Reject
        </button>
      </div>
      {Boolean(error) && (
        <p role="alert" className="text-sm text-red-300">
          {errorText(error)}
        </p>
      )}
    </div>
  );
}

function ApplicationRow({ application, onChanged }: { application: ApplicationView; onChanged: () => void }) {
  const review = useMutation({
    mutationFn: ({ decision, reason }: { decision: "accept" | "reject"; reason: string }) =>
      collabsApi.reviewApplication(application.id, { decision, reason }),
    onSuccess: onChanged,
  });
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/[0.06]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={`/profile/${application.applicantAddress}`} className="font-mono text-sm text-monad-300 hover:text-monad-200">
          {shortAddress(application.applicantAddress)}
        </Link>
        <Badge tone={application.status === "accepted" ? "mint" : application.status === "rejected" ? "danger" : "yellow"}>
          {application.status}
        </Badge>
      </div>
      <p className="text-sm leading-relaxed whitespace-pre-line text-white/75">{application.proposal}</p>
      {application.evidence.length > 0 && (
        <p className="text-xs text-white/55">Passport evidence: {application.evidence.map((item) => item.title).join(" · ")}</p>
      )}
      {application.decisionReason && <p className="text-xs text-white/55">Decision: {application.decisionReason}</p>}
      {application.status === "pending" && (
        <DecisionForm
          label="Reason"
          pending={review.isPending}
          error={review.error}
          onDecide={(decision, reason) => review.mutate({ decision, reason })}
        />
      )}
    </div>
  );
}

function DeliverableReviewForm({ deliverable, onChanged }: { deliverable: DeliverableView; onChanged: () => void }) {
  const review = useMutation({
    mutationFn: ({ decision, reason }: { decision: "accept" | "reject"; reason: string }) =>
      collabsApi.reviewDeliverable(deliverable.id, { decision, reason }),
    onSuccess: onChanged,
  });
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-crayon-yellow/25 bg-crayon-yellow/[0.05] p-4">
      <p className="text-sm">
        Revision {deliverable.revision} from <span className="font-mono">{shortAddress(deliverable.creatorAddress)}</span> is waiting for
        your review.
      </p>
      <DecisionForm
        label="Reason (shared with the creator and kept in the review history)"
        pending={review.isPending}
        error={review.error}
        onDecide={(decision, reason) => review.mutate({ decision, reason })}
      />
      <p className="text-xs text-white/45">
        Accepting records the work as a verified campaign contribution on the creator&apos;s Passport. Payment is a
        separate step from your wallet.
      </p>
    </div>
  );
}
