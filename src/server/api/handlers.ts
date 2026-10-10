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
  adjustmentSchema,
  emptyBodySchema,
  evidenceClaimSchema,
  issueSchema,
  leaderboardQuerySchema,
  pageQuerySchema,
  reviewQueueStatusSchema,
  reviewSchema,
  signInSchema,
} from "@/server/api/schemas";
import { getPassport, issueForEvidence, listForReview, reviewEvidence, submitEvidence } from "@/server/passport/service";
import {
  adjustReputation,
  getLeaderboard,
  getReputation,
  recalculateReputation,
} from "@/server/reputation/service";
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
    const result = await issueForEvidence(services, body.evidenceId, auth.user.id);
    return json({
      issued: result.stamps.map((stamp) => ({ id: stamp.id, category: stamp.category })),
      reputationEventsCreated: result.events.length,
    });
  });

// Reputation ------------------------------------------------------------------

async function loadReputation(services: Services, address: string) {
  requireStore(services);
  if (!normalizeAddress(address)) throw badRequest("That is not a valid wallet address.", "invalid_address");
  const result = await getReputation(services, address);
  if (!result) throw notFound("No passport exists for this address yet.");
  return result;
}

/** Score, tier, rank, per-category breakdown, consistency weeks, and snapshot history. */
export const getReputationByAddress = (_request: Request, services: Services, address: string) =>
  handle(async () => {
    const { reputation, ...rest } = await loadReputation(services, address);
    const { events, ...summary } = reputation;
    return json({ ...rest, reputation: { ...summary, eventCount: events.length } });
  });

/** The ledger events behind a score, newest first, with supporting evidence. Paginated. */
export const getReputationEvents = (request: Request, services: Services, address: string) =>
  handle(async () => {
    const { reputation } = await loadReputation(services, address);
    const url = new URL(request.url);
    const query = pageQuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!query.success) throw badRequest("Invalid page.");
    const { page } = query.data;
    const pageSize = 50;
    return json({
      address: normalizeAddress(address),
      calculationVersion: reputation.calculationVersion,
      page,
      pageSize,
      totalEvents: reputation.events.length,
      events: reputation.events.slice((page - 1) * pageSize, page * pageSize),
    });
  });

export const getLeaderboardPage = (request: Request, services: Services) =>
  handle(async () => {
    const url = new URL(request.url);
    const query = leaderboardQuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!query.success) throw badRequest("Unknown category or page.");
    return json(await getLeaderboard(services, { category: query.data.category ?? null, page: query.data.page }));
  });

/**
 * Re-runs the rules engine for one passport. Reviewer or admin only. Takes no
 * points: the server derives every point from verified evidence.
 */
export const postRecalculate = (request: Request, services: Services, address: string) =>
  handle(async () => {
    assertSameOrigin(request, services);
    const auth = await requireAuth(request, services);
    requireRole(auth.user, ["reviewer", "admin"]);
    await readBody(request, emptyBodySchema);
    const store = requireStore(services);
    const normalized = normalizeAddress(address);
    if (!normalized) throw badRequest("That is not a valid wallet address.", "invalid_address");
    const target = await store.findUserByAddress(normalized);
    if (!target) throw notFound("No passport exists for this address yet.");
    const created = await recalculateReputation(services, target.id, { cause: "recalculation", actorId: auth.user.id });
    return json({ eventsCreated: created.length, reputation: (await loadReputation(services, normalized)).reputation.total });
  });

/** Authorized correction. Admin only, never on one's own score, always with a reason. */
export const postAdjustment = (request: Request, services: Services, address: string) =>
  handle(async () => {
    assertSameOrigin(request, services);
    const auth = await requireAuth(request, services);
    requireRole(auth.user, ["admin"]);
    const body = await readBody(request, adjustmentSchema);
    const event = await adjustReputation(services, auth.user, address, body);
    return json({ adjustment: { id: event.id, points: event.points, reason: event.reason } }, { status: 201 });
  });

/**
 * Rebuilds every ledger from verified evidence with the current rules (for
 * example after a rules-version change or a migration). Admin only.
 */
export const postRecalculateAll = (request: Request, services: Services) =>
  handle(async () => {
    assertSameOrigin(request, services);
    const auth = await requireAuth(request, services);
    requireRole(auth.user, ["admin"]);
    await readBody(request, emptyBodySchema);
    const store = requireStore(services);
    let eventsCreated = 0;
    const userIds = await store.listUsersWithReputationData();
    for (const userId of userIds) {
      eventsCreated += (await recalculateReputation(services, userId, { cause: "recalculation", actorId: auth.user.id })).length;
    }
    return json({ usersRecalculated: userIds.length, eventsCreated });
  });
