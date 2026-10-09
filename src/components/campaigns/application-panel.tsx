"use client";

import { useId, useState } from "react";
import { useWallet } from "@/components/wallet/use-wallet";
import { ConnectButton } from "@/components/wallet/connect-button";
import { shortAddress } from "@/lib/format";
import type { Campaign } from "@/lib/types";

type Draft = { pitch: string; portfolio: string; days: string; original: boolean };
type Errors = Partial<Record<keyof Draft, string>>;

const emptyDraft: Draft = { pitch: "", portfolio: "", days: "", original: false };
const minPitchLength = 60;

function validate(draft: Draft): Errors {
  const errors: Errors = {};
  if (draft.pitch.trim().length < minPitchLength) {
    errors.pitch = `Tell the project a bit more (at least ${minPitchLength} characters).`;
  }
  try {
    const url = new URL(draft.portfolio);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("protocol");
  } catch {
    errors.portfolio = "Enter a full link, starting with https://";
  }
  const days = Number(draft.days);
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    errors.days = "Enter a whole number of days between 1 and 90.";
  }
  if (!draft.original) errors.original = "Please confirm the work will be your own.";
  return errors;
}

/**
 * Application form for a campaign.
 *
 * Phase 1 has no backend, so a valid application is kept as a local draft and
 * never sent anywhere. The wallet address identifies the applicant; it is not
 * proof of ownership. Phase 2 will add a signed message for that.
 */
export function ApplicationPanel({ campaign }: { campaign: Campaign }) {
  const { address, status } = useWallet();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [errors, setErrors] = useState<Errors>({});
  const [submitted, setSubmitted] = useState(false);
  const id = useId();

  if (campaign.status !== "open") {
    return (
      <Panel title="Applications closed">
        <p className="text-sm leading-relaxed text-white/65">
          {campaign.status === "completed"
            ? "This campaign is complete. Browse open campaigns to find your next collab."
            : "The project has stopped taking applications and is reviewing submissions."}
        </p>
      </Panel>
    );
  }

  // Only auto-reconnect shows a skeleton. A user-started connect keeps this
  // panel (and the wallet dialog inside it) mounted so errors stay visible.
  if (status === "reconnecting") {
    return (
      <Panel title="Apply to this campaign">
        <div className="flex flex-col gap-3" aria-hidden="true">
          <div className="skeleton h-4 w-3/4" />
          <div className="skeleton h-24 w-full" />
          <div className="skeleton h-11 w-full" />
        </div>
        <p role="status" className="sr-only">
          Checking your wallet connection…
        </p>
      </Panel>
    );
  }

  if (status !== "connected" || !address) {
    return (
      <Panel title="Apply to this campaign">
        <p className="text-sm leading-relaxed text-white/65">
          Connect a wallet so the project knows which passport is applying. Your passport stamps and reputation
          travel with your application.
        </p>
        <ConnectButton className="w-full" label="Connect wallet to apply" />
      </Panel>
    );
  }

  if (submitted) {
    return (
      <Panel title="Application draft ready">
        <div className="flex flex-col gap-3 rounded-2xl border border-crayon-yellow/25 bg-crayon-yellow/[0.07] p-4 text-sm leading-relaxed text-crayon-yellow/90">
          <p className="font-medium">Not sent. This is a Phase 1 preview.</p>
          <p className="text-crayon-yellow/80">
            Your answers passed validation and are kept only in this browser tab. When the Collab Board launches,
            you&apos;ll confirm by signing a message with {shortAddress(address)}. No transaction, no gas.
          </p>
        </div>
        <dl className="grid gap-2 text-sm">
          <div>
            <dt className="text-white/50">Portfolio</dt>
            <dd className="break-all">{draft.portfolio}</dd>
          </div>
          <div>
            <dt className="text-white/50">Delivery estimate</dt>
            <dd>{draft.days} days</dd>
          </div>
        </dl>
        <button type="button" className="btn btn-ghost w-full" onClick={() => setSubmitted(false)}>
          Edit application
        </button>
      </Panel>
    );
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const fieldError = (key: keyof Draft) =>
    errors[key] ? (
      <p id={`${id}-${key}-error`} className="text-xs text-red-300">
        {errors[key]}
      </p>
    ) : null;

  return (
    <Panel title="Apply to this campaign">
      <p className="text-sm text-white/60">
        Applying as <span className="font-mono text-white/85">{shortAddress(address)}</span>
      </p>
      {campaign.minReputation > 0 && (
        <p className="rounded-2xl bg-monad-500/10 px-4 py-3 text-xs leading-relaxed text-monad-200 ring-1 ring-monad-400/20">
          Requires {campaign.minReputation}+ reputation. Your score will be checked automatically once passports are
          live.
        </p>
      )}
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const nextErrors = validate(draft);
          setErrors(nextErrors);
          if (Object.keys(nextErrors).length === 0) setSubmitted(true);
        }}
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-pitch`} className="text-sm font-medium">
            Why you?
          </label>
          <textarea
            id={`${id}-pitch`}
            rows={5}
            className="field resize-y"
            placeholder="Your approach, relevant work, and anything the project should know."
            value={draft.pitch}
            onChange={(event) => set("pitch", event.target.value)}
            aria-invalid={Boolean(errors.pitch)}
            aria-describedby={errors.pitch ? `${id}-pitch-error` : `${id}-pitch-count`}
          />
          <p id={`${id}-pitch-count`} className="text-right text-xs text-white/40 tabular-nums">
            {draft.pitch.trim().length} / {minPitchLength}+
          </p>
          {fieldError("pitch")}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-portfolio`} className="text-sm font-medium">
            Portfolio or relevant work
          </label>
          <input
            id={`${id}-portfolio`}
            type="url"
            inputMode="url"
            className="field"
            placeholder="https://"
            value={draft.portfolio}
            onChange={(event) => set("portfolio", event.target.value)}
            aria-invalid={Boolean(errors.portfolio)}
            aria-describedby={errors.portfolio ? `${id}-portfolio-error` : undefined}
          />
          {fieldError("portfolio")}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-days`} className="text-sm font-medium">
            Days to deliver
          </label>
          <input
            id={`${id}-days`}
            type="number"
            inputMode="numeric"
            min={1}
            max={90}
            className="field"
            value={draft.days}
            onChange={(event) => set("days", event.target.value)}
            aria-invalid={Boolean(errors.days)}
            aria-describedby={errors.days ? `${id}-days-error` : undefined}
          />
          {fieldError("days")}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="flex items-start gap-3 text-sm text-white/75">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-monad-500"
              checked={draft.original}
              onChange={(event) => set("original", event.target.checked)}
              aria-invalid={Boolean(errors.original)}
              aria-describedby={errors.original ? `${id}-original-error` : undefined}
            />
            The work I submit will be my own, and I&apos;ve read the requirements.
          </label>
          {fieldError("original")}
        </div>

        <button type="submit" className="btn btn-primary w-full">
          Review application
        </button>
        <p className="text-center text-xs text-white/45">Preview only. Nothing is sent in Phase 1.</p>
      </form>
    </Panel>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="glass flex flex-col gap-4 rounded-3xl p-5 sm:p-6" aria-label={title}>
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}
