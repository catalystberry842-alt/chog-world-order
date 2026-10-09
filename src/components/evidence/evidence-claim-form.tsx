"use client";

import { useMutation } from "@tanstack/react-query";
import { useId, useState } from "react";
import { ApiError, submitClaim, type ClaimInput } from "@/lib/client/passport-api";
import { evidenceKindLabels, verificationMethodLabels } from "@/lib/passport/labels";
import { methodForEvidenceKind, stampCatalogue, stampForEvidenceKind } from "@/lib/passport/stamps";
import { evidenceKinds, type EvidenceKind } from "@/lib/passport/types";

const referenceField: Record<EvidenceKind, { label: string; placeholder: string; hint: string }> = {
  "onchain-interaction": {
    label: "Transaction hash",
    placeholder: "0x…",
    hint: "We check the receipt on Monad: it must be sent by your wallet to a supported app.",
  },
  "community-contribution": {
    label: "Link to the contribution",
    placeholder: "https://",
    hint: "A public page a reviewer can check: event recap, guide, artwork, translation.",
  },
  "code-contribution": {
    label: "Link to the merged change",
    placeholder: "https://github.com/org/repo/pull/123",
    hint: "A maintainer confirms the change was merged and that it is yours.",
  },
  "research-contribution": {
    label: "Link to the report",
    placeholder: "https://",
    hint: "A public report, dashboard, or analysis a reviewer can read.",
  },
  "campaign-deliverable": {
    label: "Deliverable id",
    placeholder: "e.g. meetup-recap-reel",
    hint: "Campaign acceptance comes from the Collab Board, which is not live yet. Claims are stored as unavailable.",
  },
};

type Result = { tone: "success" | "pending" | "warning" | "error"; text: string };

/**
 * Submit evidence for the signed-in wallet. The server decides the status:
 * the form never marks anything as verified.
 */
export function EvidenceClaimForm({
  supportedApps,
  onSubmitted,
}: {
  supportedApps: { id: string; name: string }[];
  onSubmitted: () => void;
}) {
  const id = useId();
  const [kind, setKind] = useState<EvidenceKind>("community-contribution");
  const [form, setForm] = useState({ title: "", summary: "", reference: "", occurredAt: "", appId: "" });
  const [result, setResult] = useState<Result | null>(null);

  const submit = useMutation({
    mutationFn: (claim: ClaimInput) => submitClaim(claim),
    onSuccess: ({ evidence, issuedStamps }) => {
      onSubmitted();
      setForm({ title: "", summary: "", reference: "", occurredAt: "", appId: "" });
      const stamps = issuedStamps.map((category) => stampCatalogue[category].name).join(", ");
      setResult(
        evidence.status === "verified"
          ? { tone: "success", text: `Verified. ${stamps ? `New stamps: ${stamps}.` : "Reputation updated."}` }
          : evidence.status === "pending"
            ? { tone: "pending", text: `Submitted and pending verification. ${evidence.statusReason ?? ""}` }
            : evidence.status === "unavailable"
              ? { tone: "warning", text: `Saved, but it cannot be verified yet. ${evidence.statusReason ?? ""}` }
              : { tone: "error", text: `Not verified. ${evidence.statusReason ?? ""}` },
      );
    },
    onError: (error) => {
      setResult({
        tone: "error",
        text:
          error instanceof ApiError && error.code === "duplicate_evidence"
            ? "This evidence has already been submitted, by you or someone else."
            : error.message,
      });
    },
  });

  const field = referenceField[kind];
  const stamp = stampCatalogue[stampForEvidenceKind[kind]];
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  return (
    <section aria-labelledby={`${id}-title`} className="glass flex flex-col gap-5 rounded-[2rem] p-6 sm:p-8">
      <div className="flex flex-col gap-1">
        <h2 id={`${id}-title`} className="font-display text-2xl font-semibold">
          Submit evidence
        </h2>
        <p className="text-sm text-white/60">
          Stamps and reputation are issued only after verification. Each piece of evidence can be claimed once.
        </p>
      </div>

      <form
        className="grid gap-4 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          setResult(null);
          submit.mutate({
            kind,
            title: form.title,
            summary: form.summary,
            reference: form.reference,
            occurredAt: kind === "onchain-interaction" ? undefined : form.occurredAt || undefined,
            appId: kind === "onchain-interaction" ? form.appId || undefined : undefined,
          });
        }}
      >
        <div className="flex flex-col gap-1.5 md:col-span-2">
          <label htmlFor={`${id}-kind`} className="text-sm font-medium">
            What did you do?
          </label>
          <select
            id={`${id}-kind`}
            className="field"
            value={kind}
            onChange={(event) => {
              setKind(event.target.value as EvidenceKind);
              setResult(null);
            }}
          >
            {evidenceKinds.map((option) => (
              <option key={option} value={option}>
                {evidenceKindLabels[option]}
              </option>
            ))}
          </select>
          <p className="text-xs text-white/50">
            Can earn the <span className="text-white/80">{stamp.name}</span> stamp · verified by{" "}
            {verificationMethodLabels[methodForEvidenceKind[kind]].toLowerCase()}.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-ref`} className="text-sm font-medium">
            {field.label}
          </label>
          <input
            id={`${id}-ref`}
            className="field font-mono text-sm"
            required
            placeholder={field.placeholder}
            value={form.reference}
            onChange={set("reference")}
            aria-describedby={`${id}-ref-hint`}
            autoComplete="off"
          />
          <p id={`${id}-ref-hint`} className="text-xs text-white/50">
            {field.hint}
          </p>
        </div>

        {kind === "onchain-interaction" ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-app`} className="text-sm font-medium">
              Application
            </label>
            {supportedApps.length > 0 ? (
              <select id={`${id}-app`} className="field" required value={form.appId} onChange={set("appId")}>
                <option value="">Choose an app</option>
                {supportedApps.map((app) => (
                  <option key={app.id} value={app.id}>
                    {app.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={`${id}-app`}
                className="field"
                required
                placeholder="app-id"
                value={form.appId}
                onChange={set("appId")}
                aria-describedby={`${id}-app-hint`}
              />
            )}
            <p id={`${id}-app-hint`} className="text-xs text-white/50">
              {supportedApps.length > 0
                ? "Only listed apps can be verified."
                : "No supported apps are configured yet, so on-chain claims will be stored as unavailable."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-date`} className="text-sm font-medium">
              When did it happen?
            </label>
            <input id={`${id}-date`} type="date" className="field" value={form.occurredAt} onChange={set("occurredAt")} />
          </div>
        )}

        <div className="flex flex-col gap-1.5 md:col-span-2">
          <label htmlFor={`${id}-name`} className="text-sm font-medium">
            Title
          </label>
          <input id={`${id}-name`} className="field" required minLength={4} maxLength={120} value={form.title} onChange={set("title")} />
        </div>

        <div className="flex flex-col gap-1.5 md:col-span-2">
          <label htmlFor={`${id}-summary`} className="text-sm font-medium">
            Summary for the reviewer
          </label>
          <textarea
            id={`${id}-summary`}
            className="field resize-y"
            rows={3}
            required
            minLength={10}
            maxLength={600}
            value={form.summary}
            onChange={set("summary")}
          />
        </div>

        <div className="flex flex-col gap-3 md:col-span-2 sm:flex-row sm:items-center">
          <button type="submit" className="btn btn-primary" disabled={submit.isPending}>
            {submit.isPending ? "Submitting…" : "Submit for verification"}
          </button>
          {result && (
            <p
              role={result.tone === "error" ? "alert" : "status"}
              className={`text-sm ${
                result.tone === "success"
                  ? "text-crayon-mint"
                  : result.tone === "error"
                    ? "text-red-300"
                    : "text-crayon-yellow"
              }`}
            >
              {result.text}
            </p>
          )}
        </div>
      </form>
    </section>
  );
}
