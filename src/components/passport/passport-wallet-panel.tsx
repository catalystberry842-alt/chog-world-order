"use client";

import Link from "next/link";
import { useWallet } from "@/components/wallet/use-wallet";
import { ChogIllustration } from "@/components/ui/chog-illustration";
import { ConnectButton } from "@/components/wallet/connect-button";
import { targetChain } from "@/lib/wagmi";

/**
 * Top of the passport page. Prompts for a wallet when disconnected and shows
 * the connected address otherwise. Passport records are not stored yet, so a
 * connected wallet always sees an empty (and honest) passport.
 */
export function PassportWalletPanel() {
  const { address, status, chain } = useWallet();

  // Only auto-reconnect shows a skeleton. A user-started connect keeps this
  // panel (and the wallet dialog inside it) mounted so errors stay visible.
  if (status === "reconnecting") {
    return (
      <section className="glass flex flex-col gap-4 rounded-[2rem] p-6 sm:p-8" aria-busy="true">
        <div className="skeleton h-6 w-48" />
        <div className="skeleton h-4 w-full max-w-md" />
        <div className="skeleton h-11 w-44" />
        <p role="status" className="sr-only">
          Checking your wallet connection…
        </p>
      </section>
    );
  }

  if (status !== "connected" || !address) {
    return (
      <section
        aria-labelledby="connect-heading"
        className="glass relative grid gap-6 overflow-hidden rounded-[2rem] p-6 sm:p-8 md:grid-cols-[1fr_auto] md:items-center"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-blush-400/15 blur-3xl"
        />
        <div className="relative flex max-w-xl flex-col gap-4">
          <h2 id="connect-heading" className="font-display text-2xl font-semibold sm:text-3xl">
            Connect a wallet to open your passport
          </h2>
          <p className="leading-relaxed text-white/65">
            Your passport is tied to a public wallet address. Connecting shares that address with this page so it
            can show your stamps and history. It does not sign you in, request a signature, or move funds.
          </p>
          <ul className="grid gap-2 text-sm text-white/60 sm:grid-cols-2">
            <li className="flex gap-2">
              <span aria-hidden="true" className="text-crayon-mint">✓</span> Works with browser wallets
            </li>
            <li className="flex gap-2">
              <span aria-hidden="true" className="text-crayon-mint">✓</span> Runs on {targetChain.name}
            </li>
            <li className="flex gap-2">
              <span aria-hidden="true" className="text-crayon-mint">✓</span> NFT ownership optional
            </li>
            <li className="flex gap-2">
              <span aria-hidden="true" className="text-crayon-mint">✓</span> Never asks for your seed phrase
            </li>
          </ul>
          <ConnectButton className="w-full sm:w-fit" />
        </div>
        <ChogIllustration mood="puzzled" className="relative mx-auto hidden h-40 w-auto md:block" />
      </section>
    );
  }

  return (
    <section
      aria-labelledby="your-passport-heading"
      className="glass flex flex-col gap-5 rounded-[2rem] p-6 sm:p-8"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <p className={`text-xs font-medium ${chain ? "text-crayon-mint" : "text-crayon-yellow"}`}>
            {chain ? `Connected on ${chain.name}` : "Connected to an unsupported network"}
          </p>
          <h2 id="your-passport-heading" className="font-display text-2xl font-semibold">
            Your passport
          </h2>
          <p className="font-mono text-sm break-all text-white/70">{address}</p>
        </div>
        <Link href={`/profile/${address}`} className="btn btn-ghost btn-sm shrink-0">
          View public profile
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Stamps", "0", "Stamps appear after your first reviewed contribution."],
          ["Contributions", "0", "Contribution submissions open in Phase 2."],
          ["Reputation", "0", "Scores are calculated from reviewed work."],
        ].map(([label, value, hint]) => (
          <div key={label} className="rounded-2xl bg-night-950/40 p-4 ring-1 ring-white/[0.06]">
            <p className="text-xs text-white/55">{label}</p>
            <p className="font-display text-3xl font-semibold">{value}</p>
            <p className="mt-1 text-xs leading-relaxed text-white/45">{hint}</p>
          </div>
        ))}
      </div>
      <p className="text-sm leading-relaxed text-white/55">
        Passport records aren&apos;t stored yet, so every address starts empty in this preview. Scroll down to see a
        sample passport filled with mock data.
      </p>
    </section>
  );
}
