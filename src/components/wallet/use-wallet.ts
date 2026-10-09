"use client";

import { useSyncExternalStore } from "react";
import { useConnection } from "wagmi";

const subscribe = () => () => {};

/**
 * `useConnection`, made hydration-safe.
 *
 * The server always renders the disconnected state. Components inside a
 * Suspense boundary can hydrate after wagmi has already restored a previous
 * connection, which would cause a mismatch, so report "disconnected" until
 * hydration finishes and the real state is safe to show.
 */
export function useWallet() {
  const connection = useConnection();
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  if (!hydrated) {
    return { address: undefined, chain: undefined, status: "disconnected" as const };
  }
  return { address: connection.address, chain: connection.chain, status: connection.status };
}
