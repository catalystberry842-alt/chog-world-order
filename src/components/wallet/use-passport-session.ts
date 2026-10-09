"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSignMessage } from "wagmi";
import { createSiweMessage } from "viem/siwe";
import { sameAddress } from "@/lib/passport/address";
import { fetchNonce, fetchSession, signOut, verifySignIn } from "@/lib/client/passport-api";
import { targetChain } from "@/lib/wagmi";

/**
 * Sign-In with Ethereum for the connected wallet.
 *
 * Signing proves the wallet owns the address. It is a free off-chain
 * signature: no transaction, no gas, no token approval.
 */
export function usePassportSession(address: `0x${string}` | undefined) {
  const queryClient = useQueryClient();
  const { mutateAsync: signMessage } = useSignMessage();

  const session = useQuery({ queryKey: ["session"], queryFn: fetchSession, enabled: Boolean(address) });

  const signIn = useMutation({
    mutationFn: async () => {
      if (!address) throw new Error("Connect a wallet first.");
      const { nonce } = await fetchNonce();
      const message = createSiweMessage({
        address,
        chainId: targetChain.id,
        domain: window.location.host,
        uri: window.location.origin,
        nonce,
        version: "1",
        issuedAt: new Date(),
        statement: "Sign in to Chog World Order. This signature does not send a transaction or cost gas.",
      });
      const signature = await signMessage({ message });
      return verifySignIn(message, signature);
    },
    onSuccess: () => queryClient.invalidateQueries(),
  });

  const signOutMutation = useMutation({
    mutationFn: signOut,
    onSuccess: () => queryClient.invalidateQueries(),
  });

  const data = session.data;
  const signedIn = Boolean(address && data?.authenticated && sameAddress(data.address, address));

  return {
    session,
    signedIn,
    role: data?.authenticated ? data.role : null,
    /** Signed in, but as a different wallet than the one now connected. */
    otherWallet: Boolean(address && data?.authenticated && !sameAddress(data.address, address)),
    signIn,
    signOut: signOutMutation,
  };
}
