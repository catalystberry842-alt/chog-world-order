"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { DeliverableHistory } from "@/components/campaigns/deliverable-history";
import { ConnectButton } from "@/components/wallet/connect-button";
import { usePassportSession } from "@/components/wallet/use-passport-session";
import { useWallet } from "@/components/wallet/use-wallet";
import { ApiError, fetchPassport } from "@/lib/client/passport-api";
import { collabsApi } from "@/lib/client/collabs-api";
import type { CampaignView } from "@/lib/collabs/types";
import { sameAddress } from "@/lib/passport/address";

/** SHA-256 of a local file, computed in the browser. The file is never uploaded. */
async function sha256Hex(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return `0x${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="glass flex flex-col gap-4 rounded-3xl p-5 sm:p-6" aria-label={title}>
      <h2 className="text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong.");

/**
 * Creator side of a campaign: apply with a proposal and Passport evidence,
 * follow the application, and submit deliverables once accepted.
 */
export function CreatorPanel({ campaign }: { campaign: CampaignView }) {
  const { address, status } = useWallet();
  const { signedIn, signIn, session } = usePassportSession(address);

  if (campaign.source === "mock") {
    return (
      <Panel title="Sample campaign">
        <p className="text-sm leading-relaxed text-white/65">
          This campaign is sample data, so it cannot take applications. Real campaigns are posted by projects from the
          dashboard.
        </p>
        <Link href="/collabs/dashboard" className="btn btn-ghost w-full">
          Post a campaign
        </Link>
      </Panel>
    );
  }

  if (campaign.status !== "published") {
    return (
      <Panel title="Applications closed">
        <p className="text-sm text-white/65">This campaign is not accepting applications.</p>
      </Panel>
    );
  }

  if (status === "reconnecting") {
    return (
      <Panel title="Apply to this campaign">
        <div className="skeleton h-24 w-full" aria-hidden="true" />
      </Panel>
    );
  }

  if (status !== "connected" || !address) {
    return (
      <Panel title="Apply to this campaign">
        <p className="text-sm leading-relaxed text-white/65">
          Connect the wallet that holds your Passport. Your verified contributions can be attached to your proposal.
        </p>
        <ConnectButton className="w-full" label="Connect wallet to apply" />
      </Panel>
    );
  }

  if (campaign.ownerAddress && sameAddress(campaign.ownerAddress, address)) {
    return (
      <Panel title="Your campaign">
        <p className="text-sm text-white/65">Review applications and deliverables from your dashboard.</p>
        <Link href="/collabs/dashboard" className="btn btn-primary w-full">
          Open dashboard
        </Link>
      </Panel>
    );
  }

  if (!signedIn) {
    return (
      <Panel title="Apply to this campaign">
        <p className="text-sm leading-relaxed text-white/65">
          Sign in with a free signature to prove you own this wallet. No transaction, no gas.
        </p>
        <button type="button" className="btn btn-primary w-full" disabled={signIn.isPending || session.isLoading} onClick={() => signIn.mutate()}>
          {signIn.isPending ? "Check your wallet…" : "Sign in to apply"}
        </button>
        {signIn.error && (
          <p role="alert" className="text-sm text-red-300">
            {errorText(signIn.error)}
          </p>
        )}
      </Panel>
    );
  }

  return <Participation campaign={campaign} address={address} />;
}

function Participation({ campaign, address }: { campaign: CampaignView; address: `0x${string}` }) {
  const queryClient = useQueryClient();
  const key = ["participation", campaign.id, address.toLowerCase()];
  const participation = useQuery({ queryKey: key, queryFn: () => collabsApi.myParticipation(campaign.id) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });

  if (participation.isPending) {
    return (
      <Panel title="Your application">
        <div className="skeleton h-24 w-full" aria-hidden="true" />
        <p role="status" className="sr-only">
          Loading your application…
        </p>
      </Panel>
    );
  }
  if (participation.isError) {
    return (
      <Panel title="Your application">
        <p role="alert" className="text-sm text-red-300">
          {errorText(participation.error)}
        </p>
        <button type="button" className="btn btn-ghost btn-sm w-fit" onClick={() => participation.refetch()}>
          Try again
        </button>
      </Panel>
    );
  }

  const { application, deliverables } = participation.data;
  if (!application) {
    if (new Date(campaign.deadline) <= new Date()) {
      return (
        <Panel title="Applications closed">
          <p className="text-sm text-white/65">The deadline for this campaign has passed.</p>
        </Panel>
      );
    }
    return <ApplyForm campaignId={campaign.id} address={address} onApplied={refresh} />;
  }

  const accepted = deliverables.some((item) => item.status === "accepted");
  const open = deliverables.some((item) => item.status === "submitted");
  return (
    <Panel title="Your application">
      <p className="text-sm">
        Status:{" "}
        <span
          className={
            application.status === "accepted"
              ? "font-semibold text-crayon-mint"
              : application.status === "rejected"
                ? "font-semibold text-red-300"
                : "font-semibold text-crayon-yellow"
          }
        >
          {application.status === "pending" ? "Waiting for the project to review" : application.status}
        </span>
      </p>
      {application.decisionReason && <p className="rounded-2xl bg-white/[0.04] px-4 py-3 text-sm text-white/70">{application.decisionReason}</p>}
      {application.status === "accepted" && (
        <>
          {accepted ? (
            <p className="rounded-2xl border border-crayon-mint/25 bg-crayon-mint/10 px-4 py-3 text-sm text-crayon-mint">
              Your work was accepted. It now counts toward your Passport reputation. Payment is sent separately by the
              project from its wallet.
            </p>
          ) : open ? (
            <p className="text-sm text-crayon-yellow">Your latest submission is waiting for review.</p>
          ) : (
            <DeliverableForm applicationId={application.id} onSubmitted={refresh} />
          )}
          <DeliverableHistory deliverables={deliverables} />
        </>
      )}
    </Panel>
  );
}

function ApplyForm({ campaignId, address, onApplied }: { campaignId: string; address: string; onApplied: () => void }) {
  const id = useId();
  const [proposal, setProposal] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const passport = useQuery({ queryKey: ["passport", address.toLowerCase()], queryFn: () => fetchPassport(address) });
  const verified = passport.data?.contributions.filter((item) => item.status === "verified") ?? [];
  const apply = useMutation({ mutationFn: () => collabsApi.apply(campaignId, { proposal, evidenceIds: selected }), onSuccess: onApplied });

  return (
    <Panel title="Apply to this campaign">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          apply.mutate();
        }}
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-proposal`} className="text-sm font-medium">
            Proposal
          </label>
          <textarea
            id={`${id}-proposal`}
            className="field resize-y"
            rows={6}
            required
            minLength={60}
            maxLength={3000}
            value={proposal}
            onChange={(event) => setProposal(event.target.value)}
            placeholder="Your approach, timeline, and why you are a good fit."
          />
          <p className="text-right text-xs text-white/40 tabular-nums">{proposal.trim().length} / 60+</p>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Attach Passport evidence (optional, up to 5)</legend>
          {passport.isPending ? (
            <div className="skeleton h-10 w-full" aria-hidden="true" />
          ) : verified.length === 0 ? (
            <p className="text-xs text-white/50">You have no verified contributions yet.</p>
          ) : (
            verified.slice(0, 20).map((item) => (
              <label key={item.id} className="flex items-start gap-3 text-sm text-white/75">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-monad-500"
                  checked={selected.includes(item.id)}
                  disabled={!selected.includes(item.id) && selected.length >= 5}
                  onChange={(event) =>
                    setSelected((current) => (event.target.checked ? [...current, item.id] : current.filter((value) => value !== item.id)))
                  }
                />
                {item.title}
              </label>
            ))
          )}
        </fieldset>
        <button type="submit" className="btn btn-primary w-full" disabled={apply.isPending}>
          {apply.isPending ? "Sending…" : "Send application"}
        </button>
        {apply.error && (
          <p role="alert" className="text-sm text-red-300">
            {apply.error instanceof ApiError && apply.error.code === "duplicate_application"
              ? "You have already applied to this campaign."
              : errorText(apply.error)}
          </p>
        )}
        <p className="text-xs text-white/45">Applying earns no reputation. Accepted, delivered work does.</p>
      </form>
    </Panel>
  );
}

function DeliverableForm({ applicationId, onSubmitted }: { applicationId: string; onSubmitted: () => void }) {
  const id = useId();
  const [contentUrl, setContentUrl] = useState("");
  const [contentHash, setContentHash] = useState("");
  const [notes, setNotes] = useState("");
  const [hashing, setHashing] = useState(false);
  const submit = useMutation({
    mutationFn: () => collabsApi.submitDeliverable(applicationId, { contentUrl, contentHash, notes: notes.trim() || undefined }),
    onSuccess: onSubmitted,
  });

  return (
    <form
      className="flex flex-col gap-3 border-t border-white/[0.06] pt-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit.mutate();
      }}
    >
      <h3 className="font-medium">Submit your work</h3>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-url`} className="text-sm">
          Link to the work
        </label>
        <input id={`${id}-url`} type="url" className="field" required placeholder="https://" value={contentUrl} onChange={(event) => setContentUrl(event.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-file`} className="text-sm">
          File to fingerprint (optional)
        </label>
        <input
          id={`${id}-file`}
          type="file"
          className="text-xs text-white/60 file:mr-3 file:rounded-full file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-white"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setHashing(true);
            setContentHash(await sha256Hex(file));
            setHashing(false);
          }}
        />
        <label htmlFor={`${id}-hash`} className="text-sm">
          Content hash (SHA-256)
        </label>
        <input
          id={`${id}-hash`}
          aria-describedby={`${id}-hash-hint`}
          className="field font-mono text-xs"
          required
          pattern="^0x[0-9a-fA-F]{64}$"
          placeholder="0x… (computed from the file above, or paste it)"
          value={hashing ? "Hashing…" : contentHash}
          onChange={(event) => setContentHash(event.target.value.trim())}
        />
        <p id={`${id}-hash-hint`} className="text-xs text-white/45">
          The file stays on your device. Only its hash is stored, so the reviewed version can be identified later.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-notes`} className="text-sm">
          Notes for the reviewer (optional)
        </label>
        <textarea id={`${id}-notes`} className="field resize-y" rows={2} maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} />
      </div>
      <button type="submit" className="btn btn-primary" disabled={submit.isPending || hashing}>
        {submit.isPending ? "Submitting…" : "Submit deliverable"}
      </button>
      {submit.error && (
        <p role="alert" className="text-sm text-red-300">
          {errorText(submit.error)}
        </p>
      )}
    </form>
  );
}
