/**
 * Request handlers behind the /api routes. Each takes a standard Request and
 * the Services container and returns a Response, so they can be tested
 * without a running server.
 *
 * Rules applied to every write:
 * - Origin must match APP_ORIGIN (no cross-site writes),
 * - a valid wallet session is required,
 * - the acting wallet comes from the session, never from the body,
 * - reviewer-only actions check the user's role on the server.
 */
import { normalizeAddress } from "@/lib/passport/address";
import { orderedStamps } from "@/lib/passport/stamps";
import { clearSessionCookie, issueNonce, signIn } from "@/server/auth/siwe";
import { assertSameOrigin, getAuth, requireAuth, requireRole, requireStore } from "@/server/auth/session";
import { badRequest, notFound } from "@/server/errors";
import { handle, json, readBody } from "@/server/api/http";
import {
  evidenceClaimSchema,
  issueSchema,
  reviewQueueStatusSchema,
  reviewSchema,
  signInSchema,
} from "@/server/api/schemas";
import { getPassport, issueForEvidence, listForReview, reviewEvidence, submitEvidence } from "@/server/passport/service";
import type { Services } from "@/server/services";

// Auth -----------------------------------------------------------------------

export const getNonce = (_request: Request, services: Services) =>
  handle(async () => {
    const { nonce, cookie } = issueNonce(services);
    return json({ nonce }, { cookies: [cookie] });
  });

export const postSignIn = (request: Request, services: Services) =>
  handle(async () => {
    assertSameOrigin(request, services);
    const body = await readBody(request, signInSchema);
    const { user, cookies } = await signIn(request, body, services);
    return json({ address: user.address, role: user.role }, { cookies });
  });

export const getSession = (request: Request, services: Services) =>
  handle(async () => {
    const auth = await getAuth(request, services);
    if (!auth) return json({ authenticated: false });
    return json({ authenticated: true, address: auth.user.address, role: auth.user.role });
  });

export const postSignOut = (request: Request, services: Services) =>
  handle(async () => {
    assertSameOrigin(request, services);
    const auth = await getAuth(request, services);
    if (auth && services.store) await services.store.revokeSession(auth.session.id, services.now());
    return json({ ok: true }, { cookies: [clearSessionCookie(services)] });
  });

// Passports (public reads) ------------------------------------------------------

async function loadPassport(request: Request, services: Services, rawAddress: string) {
  requireStore(services);
  if (!normalizeAddress(rawAddress)) throw badRequest("That is not a valid wallet address.", "invalid_address");
  const viewer = (await getAuth(request, services))?.user ?? null;
  const passport = await getPassport(services, rawAddress, viewer);
  if (!passport) throw notFound("No passport exists for this address yet.");
  return passport;
}

export const getPassportByAddress = (request: Request, services: Services, address: string) =>
  handle(async () => json({ passport: await loadPassport(request, services, address) }));

export const getPassportStamps = (request: Request, services: Services, address: string) =>
  handle(async () => {
    const passport = await loadPassport(request, services, address);
    return json({ address: passport.address, stamps: passport.stamps });
  });

export const getPassportContributions = (request: Request, services: Services, address: string) =>
  handle(async () => {
    const passport = await loadPassport(request, services, address);
    return json({ address: passport.address, contributions: passport.contributions });
  });

/** The stamp catalogue. Static, needs no database. */
export const getStampCatalogue = () => handle(async () => json({ stamps: orderedStamps }));

// Evidence ---------------------------------------------------------------------

export const postEvidence = (request: Request, services: Services) =>
  handle(async () => {
    assertSameOrigin(request, services);
    const auth = await requireAuth(request, services);
    const body = await readBody(request, evidenceClaimSchema);
    const result = await submitEvidence(services, auth, {
      ...body,
      occurredAt: body.occurredAt ? new Date(`${body.occurredAt}T12:00:00Z`) : undefined,
    });
    return json(result, { status: 201 });
  });

/** Reviewers: the review queue. Contributors: their own claims (?mine=1). */
export const getEvidence = (request: Request, services: Services) =>
  handle(async () => {
    const auth = await requireAuth(request, services);
    const url = new URL(request.url);
    if (url.searchParams.get("mine") === "1") {
      const passport = await getPassport(services, auth.user.address, auth.user);
      return json({ evidence: passport?.contributions ?? [] });
    }
    const status = reviewQueueStatusSchema.safeParse(url.searchParams.get("status") ?? undefined);
    if (!status.success) throw badRequest("Unknown status filter.");
    return json({ evidence: await listForReview(services, auth.user, status.data) });
  });

export const postEvidenceReview = (request: Request, services: Services, evidenceId: string) =>
  handle(async () => {
    assertSameOrigin(request, services);
    const auth = await requireAuth(request, services);
    requireRole(auth.user, ["reviewer", "admin"]);
    const body = await readBody(request, reviewSchema);
    return json(await reviewEvidence(services, auth.user, evidenceId, body));
  });

// Stamps -----------------------------------------------------------------------

/**
 * Re-runs issuance for verified evidence. Reviewer or admin only. Idempotent,
 * and refuses evidence that is not verified, so it cannot mint stamps on demand.
 */
export const postIssueStamps = (request: Request, services: Services) =>
  handle(async () => {
    assertSameOrigin(request, services);
    const auth = await requireAuth(request, services);
    requireRole(auth.user, ["reviewer", "admin"]);
    const body = await readBody(request, issueSchema);
    const created = await issueForEvidence(services, body.evidenceId, auth.user.id);
    return json({ issued: created.map((stamp) => ({ id: stamp.id, category: stamp.category })) });
  });
