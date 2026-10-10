/**
 * Collab Board request handlers. Every write checks the Origin, requires a
 * wallet session, and derives the acting user from it. Owners, applicants,
 * statuses, and reputation are never taken from the request.
 */
import { assertSameOrigin, getAuth, requireAuth } from "@/server/auth/session";
import { badRequest, notFound } from "@/server/errors";
import { handle, json, readBody } from "@/server/api/http";
import {
  applicationSchema,
  campaignInputSchema,
  campaignListQuerySchema,
  decisionSchema,
  deliverableSchema,
  registrationHintSchema,
  txHashSchema,
} from "@/server/api/schemas";
import {
  applyToCampaign,
  createDraft,
  getCampaign,
  listCampaigns,
  listDeliverablesFor,
  myParticipation,
  ownerDashboard,
  publishCampaign,
  reviewApplication,
  reviewDeliverable,
  submitDeliverable,
  updateDraft,
} from "@/server/collabs/service";
import {
  confirmRegistration,
  getPaymentStatus,
  preparePayment,
  reportPaymentTransaction,
} from "@/server/payments/service";
import { indexerStatus, runIndexer } from "@/server/payments/indexer";
import { alert, log } from "@/server/log";
import { getCampaign as readCampaign } from "@/server/collabs/service";
import { timingSafeEqual } from "node:crypto";
import { HttpError } from "@/server/errors";
import type { Services } from "@/server/services";

export const getCampaigns = (request: Request, services: Services) =>
  handle(async () => {
    const query = campaignListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!query.success) throw badRequest("Invalid search, category, sort, or page.");
    return json(await listCampaigns(services, { ...query.data, category: query.data.category ?? null }));
  });

export const postCampaign = (request: Request, services: Services) =>
  handle(async () => {
    assertSameOrigin(request, services);
    const auth = await requireAuth(request, services);
    const body = await readBody(request, campaignInputSchema);
    return json({ campaign: await createDraft(services, auth, body) }, { status: 201 });
  });

export const getCampaignById = (request: Request, services: Services, id: string) =>
  handle(async () => {
    const viewer = (await getAuth(request, services))?.user.id ?? null;
    const campaign = await getCampaign(services, id, viewer);
    if (!campaign) throw notFound("Campaign not found.");
    return json({ campaign });
  });

export const patchCampaign = (request: Request, services: Services, id: string) =>
  handle(async () => {
    assertSameOrigin(request, services);
    const auth = await requireAuth(request, services);
    const body = await readBody(request, campaignInputSchema);
    return json({ campaign: await updateDraft(services, auth, id, body) });
  });

export const postPublish = (request: Request, services: Services, id: string) =>
  handle(async () => {
    assertSameOrigin(request, services);
    const auth = await requireAuth(request, services);
    return json(await publishCampaign(services, auth, id));
  });

export const getMyCampaigns = (request: Request, services: Services) =>
  handle(async () => {
    const auth = await requireAuth(request, services);
    return json({ campaigns: await ownerDashboard(services, auth) });
  });

export const postApplication = (request: Request, services: Services, campaignId: string) =>
  handle(async () => {
    assertSameOrigin(request, services);
    const auth = await requireAuth(request, services);
    const body = await readBody(request, applicationSchema);
    return json({ application: await applyToCampaign(services, auth, campaignId, body) }, { status: 201 });
  });

export const getMyApplication = (request: Request, services: Services, campaignId: string) =>
  handle(async () => {
    const auth = await requireAuth(request, services);
    return json(await myParticipation(services, auth, campaignId));
  });

export const postApplicationReview = (request: Request, services: Services, applicationId: string) =>
  handle(async () => {
    assertSameOrigin(request, services);
    const auth = await requireAuth(request, services);
    const body = await readBody(request, decisionSchema);
    return json({ application: await reviewApplication(services, auth, applicationId, body) });
  });

export const postDeliverable = (request: Request, services: Services, applicationId: string) =>
  handle(async () => {
    assertSameOrigin(request, services);
    const auth = await requireAuth(request, services);
    const body = await readBody(request, deliverableSchema);
    return json({ deliverable: await submitDeliverable(services, auth, applicationId, body) }, { status: 201 });
  });

export const postDeliverableReview = (request: Request, services: Services, deliverableId: string) =>
  handle(async () => {
    assertSameOrigin(request, services);
    const auth = await requireAuth(request, services);
    const body = await readBody(request, decisionSchema);
    return json({ deliverable: await reviewDeliverable(services, auth, deliverableId, body) });
  });

export const getCampaignDeliverables = (request: Request, services: Services, campaignId: string) =>
  handle(async () => {
    const auth = await requireAuth(request, services);
    return json({ deliverables: await listDeliverablesFor(services, auth, campaignId) });
  });

// Payments ---------------------------------------------------------------------

/**
 * Checks a campaign's on-chain registration. The optional transaction hash is
 * only a hint: the server verifies the receipt and CampaignRegistered event.
 */
export const postRegistration = (request: Request, services: Services, id: string) =>
  handle(async () => {
    assertSameOrigin(request, services);
    const auth = await requireAuth(request, services);
    const body = await readBody(request, registrationHintSchema);
    await confirmRegistration(services, auth, id, body.txHash);
    return json({ campaign: await readCampaign(services, id, auth.user.id) });
  });

/** Payment instructions for an accepted deliverable. Owner only. */
export const postPaymentIntent = (request: Request, services: Services, deliverableId: string) =>
  handle(async () => {
    assertSameOrigin(request, services);
    const auth = await requireAuth(request, services);
    return json(await preparePayment(services, auth, deliverableId));
  });

/** The owner's wallet returned a transaction hash. Verified on the server; never trusted as proof. */
export const postPaymentTransaction = (request: Request, services: Services, paymentId: string) =>
  handle(async () => {
    assertSameOrigin(request, services);
    const auth = await requireAuth(request, services);
    const body = await readBody(request, txHashSchema);
    return json({ payment: await reportPaymentTransaction(services, auth, paymentId, body.txHash) });
  });

export const getPayment = (request: Request, services: Services, paymentId: string) =>
  handle(async () => {
    const auth = await requireAuth(request, services);
    return json({ payment: await getPaymentStatus(services, auth, paymentId) });
  });

/** Operator endpoints require `Authorization: Bearer <CRON_SECRET>`, compared in constant time. */
function requireOperator(request: Request, services: Services) {
  const secret = services.config.cronSecret;
  if (!secret) throw new HttpError(503, "not_configured", "CRON_SECRET is not configured.");
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new HttpError(401, "unauthorized", "Missing or invalid indexer credentials.");
  }
}

/** Scheduled indexer run. Logs every run; alerts operators when a run fails. */
export const runIndexerRequest = (request: Request, services: Services) =>
  handle(async () => {
    requireOperator(request, services);
    const result = await runIndexer(services);
    if (result.status === "error") await alert("indexer.run_failed", new Error(result.reason), { cursor: result.cursor });
    else log(result.status === "ok" ? "info" : "warn", "indexer.run", result);
    return json(result, { status: result.status === "error" ? 502 : result.status === "unavailable" ? 503 : 200 });
  });

/** Indexer health for operators and uptime monitors: cursor, heads, lag, pause state. */
export const getIndexerStatus = (request: Request, services: Services) =>
  handle(async () => {
    requireOperator(request, services);
    const status = await indexerStatus(services);
    return json(status, { status: status.status === "ok" ? 200 : status.status === "unavailable" ? 503 : 502 });
  });
