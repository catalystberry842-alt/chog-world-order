/**
 * Browser-side client for the Passport API. Requests are same-origin and send
 * the HttpOnly session cookie automatically; the token is never readable here.
 */
import type { EvidenceKind, PublicEvidence, PublicPassport, StampCategory } from "@/lib/passport/types";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      credentials: "same-origin",
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError(0, "network", "Could not reach the server. Check your connection and try again.");
  }
  const body = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
  if (!response.ok) {
    throw new ApiError(response.status, body?.error?.code ?? "error", body?.error?.message ?? "Request failed.");
  }
  return body as T;
}

export type SessionState = { authenticated: false } | { authenticated: true; address: string; role: string };

export const fetchSession = () => api<SessionState>("/api/auth/session");

/** Null when the address has no passport yet (404). */
export async function fetchPassport(address: string): Promise<PublicPassport | null> {
  try {
    return (await api<{ passport: PublicPassport }>(`/api/passports/${address}`)).passport;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export const fetchNonce = () => api<{ nonce: string }>("/api/auth/nonce");

export const verifySignIn = (message: string, signature: string) =>
  api<{ address: string; role: string }>("/api/auth/verify", {
    method: "POST",
    body: JSON.stringify({ message, signature }),
  });

export const signOut = () => api<{ ok: true }>("/api/auth/logout", { method: "POST", body: "{}" });

export type ClaimInput = {
  kind: EvidenceKind;
  title: string;
  summary: string;
  reference: string;
  occurredAt?: string;
  appId?: string;
};

export const submitClaim = (claim: ClaimInput) =>
  api<{ evidence: PublicEvidence; issuedStamps: StampCategory[] }>("/api/evidence", {
    method: "POST",
    body: JSON.stringify(claim),
  });
