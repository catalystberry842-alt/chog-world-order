"use client";

import { useId, useState } from "react";
import { formatUnits } from "viem";
import type { CampaignFormInput } from "@/lib/client/collabs-api";
import { paymentTokens, paymentTokenKeys } from "@/lib/collabs/tokens";
import type { CampaignView } from "@/lib/collabs/types";
import { campaignCategoryLabels } from "@/lib/labels";

const lines = (value: string) =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

/** datetime-local value in the browser's time zone. */
function toLocalInput(iso: string) {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function initialState(campaign?: CampaignView) {
  const token = paymentTokens[campaign?.paymentToken ?? "MON"];
  return {
    projectName: campaign?.projectName ?? "",
    title: campaign?.title ?? "",
    summary: campaign?.summary ?? "",
    description: campaign?.description ?? "",
    category: campaign?.category ?? "development",
    objectives: campaign?.objectives.join("\n") ?? "",
    deliverables: campaign?.deliverables.join("\n") ?? "",
    eligibility: campaign?.eligibility.join("\n") ?? "",
    acceptanceCriteria: campaign?.acceptanceCriteria.join("\n") ?? "",
    requiredSkills: campaign?.requiredSkills.join(", ") ?? "",
    paymentToken: campaign?.paymentToken ?? "MON",
    amountPerCreator: campaign ? formatUnits(BigInt(campaign.amountPerCreator), token.decimals) : "",
    slots: String(campaign?.slots.total ?? 1),
    deadline: campaign ? toLocalInput(campaign.deadline) : "",
  };
}

/**
 * Create or edit a draft campaign. The server validates everything again and
 * sets the owner from the signed-in wallet; nothing here decides ownership.
 */
export function CampaignForm({
  campaign,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  campaign?: CampaignView;
  pending: boolean;
  error: string | null;
  onSubmit: (input: CampaignFormInput) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [form, setForm] = useState(() => initialState(campaign));
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const field = (key: keyof typeof form, label: string, hint?: string, multiline = false, rows = 3) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`${id}-${key}`} className="text-sm font-medium">
        {label}
      </label>
      {multiline ? (
        <textarea id={`${id}-${key}`} className="field resize-y" rows={rows} value={form[key]} onChange={set(key)} aria-describedby={hint ? `${id}-${key}-hint` : undefined} />
      ) : (
        <input id={`${id}-${key}`} className="field" value={form[key]} onChange={set(key)} aria-describedby={hint ? `${id}-${key}-hint` : undefined} />
      )}
      {hint && (
        <p id={`${id}-${key}-hint`} className="text-xs text-white/45">
          {hint}
        </p>
      )}
    </div>
  );

  return (
    <form
      className="glass flex flex-col gap-5 rounded-3xl p-5 sm:p-6"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          projectName: form.projectName,
          title: form.title,
          summary: form.summary,
          description: form.description,
          category: form.category,
          objectives: lines(form.objectives),
          deliverables: lines(form.deliverables),
          eligibility: lines(form.eligibility),
          acceptanceCriteria: lines(form.acceptanceCriteria),
          requiredSkills: form.requiredSkills.split(",").map((skill) => skill.trim()).filter(Boolean),
          paymentToken: form.paymentToken,
          amountPerCreator: form.amountPerCreator,
          slots: Number.parseInt(form.slots, 10),
          deadline: form.deadline ? new Date(form.deadline).toISOString() : "",
        });
      }}
    >
      <h2 className="text-xl font-semibold">{campaign ? "Edit draft" : "New campaign"}</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {field("projectName", "Project name")}
        {field("title", "Campaign title")}
      </div>
      {field("summary", "One-line summary", "20–280 characters. Shown on campaign cards.", true, 2)}
      {field("description", "Description", "What the campaign is for and any context creators need.", true, 5)}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-category`} className="text-sm font-medium">
            Category
          </label>
          <select id={`${id}-category`} className="field" value={form.category} onChange={set("category")}>
            {Object.entries(campaignCategoryLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {field("requiredSkills", "Required skills", "Comma-separated, e.g. Solidity, Foundry")}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {field("objectives", "Objectives", "One per line.", true)}
        {field("deliverables", "Deliverables", "One per line. Required to publish.", true)}
        {field("eligibility", "Eligibility rules", "One per line. Required to publish.", true)}
        {field("acceptanceCriteria", "Acceptance criteria", "One per line. How you will decide. Required to publish.", true)}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-token`} className="text-sm font-medium">
            Payment token
          </label>
          <select id={`${id}-token`} className="field" value={form.paymentToken} onChange={set("paymentToken")}>
            {paymentTokenKeys.map((key) => (
              <option key={key} value={key} disabled={!paymentTokens[key].enabled}>
                {paymentTokens[key].symbol}
                {paymentTokens[key].enabled ? "" : " (not configured)"}
              </option>
            ))}
          </select>
        </div>
        {field("amountPerCreator", "Pay per creator", "In token units, e.g. 250")}
        {field("slots", "Creator slots")}
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-deadline`} className="text-sm font-medium">
            Deadline
          </label>
          <input id={`${id}-deadline`} type="datetime-local" className="field" value={form.deadline} onChange={set("deadline")} />
        </div>
      </div>
      <p className="text-xs text-white/45">
        Drafts can be saved incomplete. Publishing checks every field and requires a deadline at least 24 hours away.
        Payments are sent directly from your wallet when you accept work; nothing is held in escrow.
      </p>
      {error && (
        <p role="alert" className="rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save draft"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
