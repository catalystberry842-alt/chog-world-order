"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useConnect, useConnectors, useDisconnect, useSwitchChain } from "wagmi";
import { Avatar } from "@/components/ui/avatar";
import { useWallet } from "@/components/wallet/use-wallet";
import { describeWalletError } from "@/components/wallet/wallet-errors";
import { shortAddress } from "@/lib/format";
import { targetChain } from "@/lib/wagmi";

function hueFromAddress(address: string) {
  return parseInt(address.slice(2, 8), 16) % 360;
}

/**
 * Modal for connecting a browser wallet and managing the connection.
 * Uses the native <dialog> element for focus handling and Escape-to-close.
 */
export function WalletDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
      aria-labelledby="wallet-dialog-title"
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-3xl border border-white/10 bg-night-900 p-0 text-white backdrop:bg-night-950/70"
    >
      {open && <WalletDialogBody onClose={onClose} />}
    </dialog>
  );
}

function WalletDialogBody({ onClose }: { onClose: () => void }) {
  const { address, status, chain } = useWallet();

  return (
    <div className="flex flex-col gap-5 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="wallet-dialog-title" className="text-xl font-semibold">
            {status === "connected" ? "Your wallet" : "Connect a wallet"}
          </h2>
          <p className="text-sm text-white/60">
            {status === "connected"
              ? "Connected to Chog World Order."
              : "Share your public address to open your passport."}
          </p>
        </div>
        <button type="button" onClick={onClose} className="btn btn-ghost btn-sm" aria-label="Close dialog">
          ✕
        </button>
      </div>

      {status === "connected" && address ? (
        <ConnectedPanel address={address} onWrongNetwork={!chain} onClose={onClose} />
      ) : (
        <ConnectorList onConnected={onClose} />
      )}

      <p className="rounded-2xl bg-white/[0.04] px-4 py-3 text-xs leading-relaxed text-white/55">
        Connecting only shares your public address. Chog World Order never asks for your seed phrase or private
        key, and connecting does not sign you in or approve any transaction.
      </p>
    </div>
  );
}

function ConnectorList({ onConnected }: { onConnected: () => void }) {
  const connectors = useConnectors();
  const { mutate: connect, isPending, error, variables } = useConnect();
  const [lastAttempt, setLastAttempt] = useState<string | null>(null);

  // EIP-6963 wallets announce themselves with a name and icon. When any are
  // present, hide the generic "Injected" fallback to avoid a duplicate entry.
  const discovered = connectors.filter((connector) => connector.id !== "injected");
  const options = discovered.length > 0 ? discovered : connectors;

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {options.map((connector) => {
          const pending = isPending && variables?.connector === connector;
          const label = connector.id === "injected" ? "Browser wallet" : connector.name;
          return (
            <li key={connector.uid}>
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  setLastAttempt(label);
                  connect({ connector, chainId: targetChain.id }, { onSuccess: onConnected });
                }}
                className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left transition hover:border-monad-400/50 hover:bg-monad-500/10 disabled:opacity-60"
              >
                {connector.icon ? (
                  // Wallet icons are data URIs supplied by the installed extension.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={connector.icon} alt="" className="h-8 w-8 rounded-lg" />
                ) : (
                  <span
                    aria-hidden="true"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-monad-500/30 text-sm"
                  >
                    ◎
                  </span>
                )}
                <span className="flex-1 font-medium">{label}</span>
                <span className="text-xs text-white/50">{pending ? "Check your wallet…" : "Connect"}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {discovered.length === 0 && (
        <p className="text-xs text-white/50">
          No wallet extension announced itself. If you have one installed, try “Browser wallet”.
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {lastAttempt ? `${lastAttempt}: ` : ""}
          {describeWalletError(error)}
        </p>
      )}
    </div>
  );
}

function ConnectedPanel({
  address,
  onWrongNetwork,
  onClose,
}: {
  address: `0x${string}`;
  onWrongNetwork: boolean;
  onClose: () => void;
}) {
  const { mutate: disconnect } = useDisconnect();
  const { mutate: switchChain, isPending: switching, error: switchError } = useSwitchChain();
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <Avatar name={address.slice(2, 4)} hue={hueFromAddress(address)} size="md" />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-sm break-all text-white/90">{address}</p>
          <p className={`text-xs ${onWrongNetwork ? "text-crayon-yellow" : "text-crayon-mint"}`}>
            {onWrongNetwork ? "Wrong network" : `On ${targetChain.name}`}
          </p>
        </div>
      </div>

      {onWrongNetwork && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="btn btn-accent"
            disabled={switching}
            onClick={() => switchChain({ chainId: targetChain.id })}
          >
            {switching ? "Waiting for wallet…" : `Switch to ${targetChain.name}`}
          </button>
          {switchError && (
            <p role="alert" className="text-sm text-red-300">
              {describeWalletError(switchError)}
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Link href={`/profile/${address}`} className="btn btn-primary btn-sm" onClick={onClose}>
          Public profile
        </Link>
        <Link href="/passport" className="btn btn-ghost btn-sm" onClick={onClose}>
          Passport
        </Link>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(address);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? "Copied" : `Copy ${shortAddress(address)}`}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            disconnect();
            onClose();
          }}
        >
          Disconnect
        </button>
      </div>
    </div>
  );
}
