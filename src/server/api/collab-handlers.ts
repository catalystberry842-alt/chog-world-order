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
    return json({ campaign: await publishCampaign(services, auth, id) });
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
