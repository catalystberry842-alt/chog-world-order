"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { EvidenceClaimForm } from "@/components/evidence/evidence-claim-form";
import { PassportView } from "@/components/passport/passport-view";
import { ChogIllustration } from "@/components/ui/chog-illustration";
import { ProfileSkeleton } from "@/components/ui/skeletons";
import { ErrorState } from "@/components/ui/state-panels";
import { ConnectButton } from "@/components/wallet/connect-button";
import { usePassportSession } from "@/components/wallet/use-passport-session";
import { useWallet } from "@/components/wallet/use-wallet";
import { describeWalletError } from "@/components/wallet/wallet-errors";
import { ApiError, fetchPassport } from "@/lib/client/passport-api";
import { targetChain } from "@/lib/wagmi";

/**
 * The connected wallet's own passport.
 *
 * States: wallet disconnected → connect prompt; service not configured →
 * explicit notice; no record yet → empty passport (connecting alone grants
 * nothing); record found → full passport. Signing in (SIWE) unlocks pending
 * records and the evidence form.
 */
export function MyPassport({ supportedApps }: { supportedApps: { id: string; name: string }[] }) {
  const { address, status, chain } = useWallet();

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

  if (status !== "connected" || !address) return <ConnectPrompt />;

  return <ConnectedPassport address={address} onSupportedChain={Boolean(chain)} supportedApps={supportedApps} />;
}

function ConnectedPassport({
  address,
  onSupportedChain,
  supportedApps,
}: {
  address: `0x${string}`;
  onSupportedChain: boolean;
  supportedApps: { id: string; name: string }[];
}) {
  const queryClient = useQueryClient();
  const passport = useQuery({
    queryKey: ["passport", address.toLowerCase()],
    queryFn: () => fetchPassport(address),
    retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
  });
  const { signedIn, otherWallet, signIn, signOut, session } = usePassportSession(address);
  const notConfigured = passport.error instanceof ApiError && passport.error.status === 503;

  const header = (
    <section aria-labelledby="wallet-heading" className="glass flex flex-col gap-4 rounded-[2rem] p-6 sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <p className={`text-xs font-medium ${onSupportedChain ? "text-crayon-mint" : "text-crayon-yellow"}`}>
            {onSupportedChain ? `Wallet connected on ${targetChain.name}` : "Wallet connected to an unsupported network"}
          </p>
          <h2 id="wallet-heading" className="text-2xl font-semibold">
            Your passport
          </h2>
          <p className="font-mono text-sm break-all text-white/70">{address}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!notConfigured &&
            (signedIn ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => signOut.mutate()} disabled={signOut.isPending}>
                Sign out
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => signIn.mutate()}
                disabled={signIn.isPending || session.isLoading}
              >
                {signIn.isPending ? "Check your wallet…" : "Sign in to manage"}
              </button>
            ))}
          <Link href={`/profile/${address.toLowerCase()}`} className="btn btn-ghost btn-sm">
            Public profile
          </Link>
        </div>
      </div>
      {!signedIn && !notConfigured && (
        <p className="text-sm leading-relaxed text-white/55">
          {otherWallet
            ? "You are signed in with a different wallet. Sign in again to manage this one."
            : "Signing in proves you own this wallet with a free signature. No transaction, no gas. It lets you submit evidence and see claims that are still pending."}
        </p>
      )}
      {signIn.error && (
        <p role="alert" className="rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {signIn.error instanceof ApiError ? signIn.error.message : describeWalletError(signIn.error)}
        </p>
      )}
    </section>
  );

  if (notConfigured) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <ErrorState
          title="Passport records aren't available here"
          description="This deployment has no Passport database configured, so no stamps or contributions can be read or saved. Your wallet is connected, but nothing has been recorded. The sample passport below shows how a passport will look."
        />
      </div>
    );
  }

  if (passport.isPending) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <ProfileSkeleton />
        <p role="status" className="sr-only">
          Loading your passport…
        </p>
      </div>
    );
  }

  if (passport.isError) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <ErrorState
          title="Couldn't load your passport"
          description={passport.error.message}
          action={
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => passport.refetch()}>
              Try again
            </button>
          }
        />
      </div>
    );
  }

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["passport", address.toLowerCase()] });

  return (
    <div className="flex flex-col gap-8">
      {header}
      {passport.data ? (
        <PassportView passport={passport.data} audience={signedIn ? "owner" : "public"} idPrefix="mine" />
      ) : (
        <section className="glass flex flex-col items-center gap-4 rounded-[2rem] px-6 py-12 text-center">
          <ChogIllustration mood="sleepy" className="h-24 w-auto" />
          <h3 className="text-xl font-semibold">No passport record yet</h3>
          <p className="max-w-lg text-sm leading-relaxed text-white/65">
            Connecting a wallet does not grant stamps or reputation. Sign in, submit evidence of something you did, and
            stamps are issued once it is verified.
          </p>
        </section>
      )}
      {signedIn && <EvidenceClaimForm supportedApps={supportedApps} onSubmitted={refresh} />}
    </div>
  );
}

function ConnectPrompt() {
  return (
    <section
      aria-labelledby="connect-heading"
      className="glass relative grid gap-6 overflow-hidden rounded-[2rem] p-6 sm:p-8 md:grid-cols-[1fr_auto] md:items-center"
    >
      <div className="relative flex max-w-xl flex-col gap-4">
        <h2 id="connect-heading" className="text-2xl font-semibold sm:text-3xl">
          Connect a wallet to open your passport
        </h2>
        <p className="leading-relaxed text-white/65">
          Your passport is tied to a public wallet address. Connecting shows your passport; it does not create
          stamps or reputation. Those come only from verified contributions.
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
