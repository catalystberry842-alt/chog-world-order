"use client";

import { useState } from "react";
import { useWallet } from "@/components/wallet/use-wallet";
import { WalletDialog } from "@/components/wallet/wallet-dialog";
import { shortAddress } from "@/lib/format";

export function ConnectButton({
  className = "",
  label = "Connect wallet",
}: {
  className?: string;
  label?: string;
}) {
  const { address, status, chain } = useWallet();
  const [open, setOpen] = useState(false);

  const busy = status === "connecting" || status === "reconnecting";
  const connected = status === "connected" && address;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={`btn ${connected ? "btn-ghost" : "btn-primary"} ${className}`}
      >
        {busy ? (
          <>
            <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-white/70" />
            {status === "reconnecting" ? "Reconnecting…" : "Connecting…"}
          </>
        ) : connected ? (
          <>
            <span
              aria-hidden="true"
              className={`h-2 w-2 rounded-full ${chain ? "bg-crayon-mint" : "bg-crayon-yellow"}`}
            />
            <span className="font-mono text-sm">{shortAddress(address)}</span>
            <span className="sr-only">{chain ? "Connected" : "Connected to an unsupported network"}</span>
          </>
        ) : (
          label
        )}
      </button>
      <WalletDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
