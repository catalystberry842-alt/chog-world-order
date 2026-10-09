import { parseBudget, checkDeadline } from "@/lib/collabs/rules";
import { isPaymentTokenKey, paymentTokens } from "@/lib/collabs/tokens";
import type {
  ApplicationView,
  CampaignListPage,
  CampaignListQuery,
  CampaignView,
  DeliverableView,
} from "@/lib/collabs/types";
import { categoryForEvidence } from "@/lib/reputation/config";
import type { Address } from "@/lib/types";
import type { AuthContext } from "@/server/auth/session";
import { requireStore } from "@/server/auth/session";
import {
  DuplicateApplicationError,
  DuplicateDeliverableError,
  type ApplicationRecord,
  type CampaignContent,
  type CampaignWithCounts,
  type CollabStore,
  type DeliverableRecord,
} from "@/server/collabs/store";
import { badRequest, conflict, DuplicateEvidenceError, forbidden, notFound, serviceUnavailable } from "@/server/errors";
import { issueForEvidence } from "@/server/passport/service";
import type { PassportStore } from "@/server/passport/store";
import type { Services } from "@/server/services";
import type { CampaignCategory } from "@/lib/types";

export const CAMPAIGN_PAGE_SIZE = 9;

export function requireCollabs(services: Services): CollabStore {
  if (!services.collabs) {
    throw serviceUnavailable("The Collab Board is not configured on this server (DATABASE_URL is missing).");
  }
  return services.collabs;
}

// ---------------------------------------------------------------------------
// View models
// ---------------------------------------------------------------------------

async function addressOf(store: PassportStore, userId: string): Promise<Address> {
  return ((await store.findUserById(userId))?.address ?? "0x") as Address;
}

export async function toCampaignView(store: PassportStore, campaign: CampaignWithCounts): Promise<CampaignView> {
  return {
    id: campaign.id,
    title: campaign.title,
    projectName: campaign.projectName,
    summary: campaign.summary,
    description: campaign.description,
    category: campaign.category,
    status: campaign.status,
    objectives: campaign.objectives,
    deliverables: campaign.deliverables,
    eligibility: campaign.eligibility,
    acceptanceCriteria: campaign.acceptanceCriteria,
    requiredSkills: campaign.requiredSkills,
    paymentToken: isPaymentTokenKey(campaign.paymentToken) ? campaign.paymentToken : "MON",
    amountPerCreator: campaign.amountPerCreator.toString(),
    slots: { total: campaign.slots, filled: campaign.accepted },
    applicants: campaign.applicants,
    deadline: campaign.deadline.toISOString(),
    publishedAt: campaign.publishedAt?.toISOString() ?? null,
    ownerAddress: await addressOf(store, campaign.ownerId),
    registration: {
      status: campaign.registrationStatus,
      txHash: campaign.registrationTxHash,
      chainCampaignId: campaign.chainCampaignId,
      error: campaign.registrationError,
    },
    source: "database",
  };
}

async function toApplicationView(store: PassportStore, app: ApplicationRecord): Promise<ApplicationView> {
  const evidence = (await Promise.all(app.evidenceIds.map((id) => store.findEvidence(id))))
    .filter((record) => record !== null)
    .map((record) => ({ id: record.id, title: record.title, kind: record.kind }));
  return {
    id: app.id,
    campaignId: app.campaignId,
    applicantAddress: await addressOf(store, app.applicantId),
    proposal: app.proposal,
    evidence,
    status: app.status,
    decisionReason: app.decisionReason,
    reviewedAt: app.reviewedAt?.toISOString() ?? null,
    createdAt: app.createdAt.toISOString(),
  };
}

async function toDeliverableViews(store: PassportStore, collabs: CollabStore, items: DeliverableRecord[]): Promise<DeliverableView[]> {
  const reviews = await collabs.listDeliverableReviews(items.map((item) => item.id));
  return Promise.all(
    items.map(async (item) => ({
      id: item.id,
      applicationId: item.applicationId,
      campaignId: item.campaignId,
      creatorAddress: await addressOf(store, item.creatorId),
      contentUrl: item.contentUrl,
      contentHash: item.contentHash,
      notes: item.notes,
      revision: item.revision,
      status: item.status,
      createdAt: item.createdAt.toISOString(),
      reviews: await Promise.all(
        reviews
          .filter((review) => review.deliverableId === item.id)
          .map(async (review) => ({
            decision: review.decision,
            reason: review.reason,
            reviewerAddress: await addressOf(store, review.reviewerId),
            createdAt: review.createdAt.toISOString(),
          })),
      ),
    })),
  );
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

export type CampaignInput = {
  projectName: string;
  title: string;
  summary: string;
  description: string;
  category: CampaignCategory;
  objectives: string[];
  deliverables: string[];
  eligibility: string[];
  acceptanceCriteria: string[];
  requiredSkills: string[];
  paymentToken: string;
  /** Human amount per creator, e.g. "400" or "12.5". */
  amountPerCreator: string;
  slots: number;
  /** ISO date-time. */
  deadline: string;
};

function toContent(input: CampaignInput): CampaignContent {
  if (!isPaymentTokenKey(input.paymentToken)) throw badRequest("Unsupported payment token.", "unsupported_token");
  const token = paymentTokens[input.paymentToken];
  if (!token.enabled) {
    throw badRequest(`${token.symbol} payments are not configured on this server.`, "unsupported_token");
  }
  const budget = parseBudget(input.amountPerCreator, token);
  if (!budget.ok) throw badRequest(budget.reason, "invalid_budget");
  const deadline = new Date(input.deadline);
  if (Number.isNaN(deadline.getTime())) throw badRequest("Enter a valid deadline.", "invalid_deadline");
  return {
    projectName: input.projectName,
    title: input.title,
    summary: input.summary,
    description: input.description,
    category: input.category,
    objectives: input.objectives,
    deliverables: input.deliverables,
    eligibility: input.eligibility,
    acceptanceCriteria: input.acceptanceCriteria,
    requiredSkills: input.requiredSkills.map((skill) => skill.toLowerCase()),
    paymentToken: input.paymentToken,
    amountPerCreator: budget.baseUnits,
    slots: input.slots,
    deadline,
  };
}

/** Creates a draft owned by the signed-in wallet. */
export async function createDraft(services: Services, auth: AuthContext, input: CampaignInput) {
  const collabs = requireCollabs(services);
  const store = requireStore(services);
  const campaign = await collabs.createCampaign(auth.user.id, toContent(input));
  return toCampaignView(store, { ...campaign, applicants: 0, accepted: 0 });
}

async function ownedCampaign(collabs: CollabStore, auth: AuthContext, id: string) {
  const campaign = await collabs.findCampaign(id);
  if (!campaign) throw notFound("Campaign not found.");
  if (campaign.ownerId !== auth.user.id) throw forbidden("Only the campaign owner can do this.");
  return campaign;
}

/** Edits a draft. Owner only; published campaigns cannot be edited. */
export async function updateDraft(services: Services, auth: AuthContext, id: string, input: CampaignInput) {
  const collabs = requireCollabs(services);
  const store = requireStore(services);
  const campaign = await ownedCampaign(collabs, auth, id);
  if (campaign.status !== "draft") throw conflict("not_draft", "Only draft campaigns can be edited.");
  const updated = await collabs.updateCampaignIfStatus(id, "draft", toContent(input));
  if (!updated) throw conflict("not_draft", "Only draft campaigns can be edited.");
  return toCampaignView(store, { ...updated, applicants: campaign.applicants, accepted: campaign.accepted });
}

/** Everything a draft needs before it can be published. Returns problems, or an empty list. */
export function publicationProblems(campaign: CampaignContent, now: Date): string[] {
  const problems: string[] = [];
  if (campaign.deliverables.length === 0) problems.push("List at least one deliverable.");
  if (campaign.acceptanceCriteria.length === 0) problems.push("List at least one acceptance criterion.");
  if (campaign.eligibility.length === 0) problems.push("List at least one eligibility rule.");
  if (campaign.objectives.length === 0) problems.push("List at least one objective.");
  if (campaign.amountPerCreator <= BigInt(0)) problems.push("Set a budget greater than zero.");
  if (!isPaymentTokenKey(campaign.paymentToken) || !paymentTokens[campaign.paymentToken].enabled) {
    problems.push("Choose a supported payment token.");
  }
  const deadline = checkDeadline(campaign.deadline, now);
  if (deadline) problems.push(deadline);
  return problems;
}

/**
 * Publishes a draft after validation. Owner only. On-chain registration is
 * tracked separately (registration status) and handled by the payments
 * integration.
 */
export async function publishCampaign(services: Services, auth: AuthContext, id: string) {
  const collabs = requireCollabs(services);
  const store = requireStore(services);
  const campaign = await ownedCampaign(collabs, auth, id);
  if (campaign.status !== "draft") throw conflict("not_draft", "Only draft campaigns can be published.");
  const problems = publicationProblems(campaign, services.now());
  if (problems.length > 0) throw badRequest(problems.join(" "), "not_publishable");
  const updated = await collabs.updateCampaignIfStatus(id, "draft", { status: "published", publishedAt: services.now() });
  if (!updated) throw conflict("not_draft", "Only draft campaigns can be published.");
  return toCampaignView(store, { ...updated, applicants: campaign.applicants, accepted: campaign.accepted });
}

/** Public campaign, or a draft for its owner. */
export async function getCampaign(services: Services, id: string, viewerId: string | null) {
  const collabs = requireCollabs(services);
  const store = requireStore(services);
  const campaign = await collabs.findCampaign(id);
  if (!campaign) return null;
  if (campaign.status === "draft" && campaign.ownerId !== viewerId) return null;
  return toCampaignView(store, campaign);
}

export async function listCampaigns(services: Services, query: CampaignListQuery): Promise<CampaignListPage> {
  const collabs = requireCollabs(services);
  const store = requireStore(services);
  const page = Math.max(1, query.page);
  const { rows, total } = await collabs.listCampaigns({
    q: query.q,
    category: query.category,
    sort: query.sort,
    statuses: ["published", "closed", "completed"],
    skip: (page - 1) * CAMPAIGN_PAGE_SIZE,
    take: CAMPAIGN_PAGE_SIZE,
  });
  return {
    campaigns: await Promise.all(rows.map((row) => toCampaignView(store, row))),
    page,
    pageSize: CAMPAIGN_PAGE_SIZE,
    total,
    source: "database",
  };
}

/** The owner's dashboard: their campaigns with applications and deliverables. */
export async function ownerDashboard(services: Services, auth: AuthContext) {
  const collabs = requireCollabs(services);
  const store = requireStore(services);
  const campaigns = await collabs.listCampaignsByOwner(auth.user.id);
  return Promise.all(
    campaigns.map(async (campaign) => ({
      campaign: await toCampaignView(store, campaign),
      applications: await Promise.all(
        (await collabs.listApplications({ campaignId: campaign.id })).map((app) => toApplicationView(store, app)),
      ),
      deliverables: await toDeliverableViews(store, collabs, await collabs.listDeliverables({ campaignId: campaign.id })),
    })),
  );
}

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------

/**
 * Applies to a published, open campaign as the signed-in wallet. Attached
 * evidence must be the applicant's own verified Passport evidence.
 */
export async function applyToCampaign(
  services: Services,
  auth: AuthContext,
  campaignId: string,
  input: { proposal: string; evidenceIds: string[] },
) {
  const collabs = requireCollabs(services);
  const store = requireStore(services);
  const campaign = await collabs.findCampaign(campaignId);
  if (!campaign || campaign.status === "draft") throw notFound("Campaign not found.");
  if (campaign.status !== "published") throw conflict("campaign_closed", "This campaign is not accepting applications.");
  if (campaign.deadline <= services.now()) throw conflict("deadline_passed", "The deadline for this campaign has passed.");
  if (campaign.ownerId === auth.user.id) throw forbidden("You cannot apply to your own campaign.");

  const evidenceIds = [...new Set(input.evidenceIds)];
  for (const id of evidenceIds) {
    const evidence = await store.findEvidence(id);
    if (!evidence || evidence.userId !== auth.user.id || evidence.status !== "verified") {
      throw badRequest("Attach only your own verified Passport evidence.", "invalid_evidence");
    }
  }

  try {
    const app = await collabs.createApplication({ campaignId, applicantId: auth.user.id, proposal: input.proposal, evidenceIds });
    return toApplicationView(store, app);
  } catch (error) {
    if (error instanceof DuplicateApplicationError) throw conflict("duplicate_application", error.message);
    throw error;
  }
}

/** The signed-in wallet's applications and deliverables for one campaign. */
export async function myParticipation(services: Services, auth: AuthContext, campaignId: string) {
  const collabs = requireCollabs(services);
  const store = requireStore(services);
  const [app] = await collabs.listApplications({ campaignId, applicantId: auth.user.id });
  if (!app) return { application: null, deliverables: [] };
  return {
    application: await toApplicationView(store, app),
    deliverables: await toDeliverableViews(store, collabs, await collabs.listDeliverables({ applicationId: app.id })),
  };
}

/**
 * Accepts or rejects an application. Only the campaign owner may decide, and
 * never on their own application. Acceptance respects the campaign's slots.
 */
export async function reviewApplication(
  services: Services,
  auth: AuthContext,
  applicationId: string,
  input: { decision: "accept" | "reject"; reason: string },
) {
  const collabs = requireCollabs(services);
  const store = requireStore(services);
  const app = await collabs.findApplication(applicationId);
  if (!app) throw notFound("Application not found.");
  const campaign = await ownedCampaign(collabs, auth, app.campaignId);
  if (app.applicantId === auth.user.id) throw forbidden("You cannot review your own application.");
  if (campaign.status !== "published") throw conflict("campaign_closed", "This campaign is not open.");

  const result = await collabs.decideApplication(applicationId, {
    status: input.decision === "accept" ? "accepted" : "rejected",
    reason: input.reason,
    reviewerId: auth.user.id,
    at: services.now(),
    slots: campaign.slots,
  });
  if (result === "not_pending") throw conflict("already_reviewed", "This application has already been reviewed.");
  if (result === "full") throw conflict("campaign_full", "All slots for this campaign are filled.");
  return toApplicationView(store, result);
}

// ---------------------------------------------------------------------------
// Deliverables
// ---------------------------------------------------------------------------

/** Submits work for an accepted application. Only the applicant, before the deadline. */
export async function submitDeliverable(
  services: Services,
  auth: AuthContext,
  applicationId: string,
  input: { contentUrl: string; contentHash: string; notes?: string },
) {
  const collabs = requireCollabs(services);
  const store = requireStore(services);
  const app = await collabs.findApplication(applicationId);
  if (!app) throw notFound("Application not found.");
  if (app.applicantId !== auth.user.id) throw forbidden("Only the accepted creator can submit work.");
  if (app.status !== "accepted") throw conflict("not_accepted", "Your application has not been accepted.");
  const campaign = await collabs.findCampaign(app.campaignId);
  if (!campaign || campaign.status !== "published") throw conflict("campaign_closed", "This campaign is not open.");
  if (campaign.deadline <= services.now()) throw conflict("deadline_passed", "The deadline for this campaign has passed.");

  try {
    const result = await collabs.submitDeliverable({
      campaignId: app.campaignId,
      applicationId,
      creatorId: auth.user.id,
      contentUrl: input.contentUrl,
      contentHash: input.contentHash.toLowerCase(),
      notes: input.notes?.trim() || null,
    });
    if (result === "open_submission") {
      throw conflict("open_submission", "Your previous submission is still waiting for review.");
    }
    if (result === "already_accepted") throw conflict("already_accepted", "Your work for this campaign was already accepted.");
    return (await toDeliverableViews(store, collabs, [result]))[0];
  } catch (error) {
    if (error instanceof DuplicateDeliverableError) throw conflict("duplicate_deliverable", error.message);
    throw error;
  }
}

/**
 * Accepts or rejects a submission with a recorded reason. Owner only, never
 * the creator. Acceptance records verified campaign evidence for the creator,
 * which earns the Collaborator stamp and campaign reputation exactly once.
 * Applying, publishing, or submitting alone earns nothing.
 */
export async function reviewDeliverable(
  services: Services,
  auth: AuthContext,
  deliverableId: string,
  input: { decision: "accept" | "reject"; reason: string },
) {
  const collabs = requireCollabs(services);
  const store = requireStore(services);
  const deliverable = await collabs.findDeliverable(deliverableId);
  if (!deliverable) throw notFound("Deliverable not found.");
  const campaign = await ownedCampaign(collabs, auth, deliverable.campaignId);
  if (deliverable.creatorId === auth.user.id) throw forbidden("You cannot review your own work.");

  const now = services.now();
  const reviewed = await collabs.reviewDeliverable(deliverableId, {
    decision: input.decision === "accept" ? "accepted" : "rejected",
    reason: input.reason,
    reviewerId: auth.user.id,
    at: now,
  });
  if (!reviewed) throw conflict("already_reviewed", "This submission has already been reviewed.");

  if (reviewed.status === "accepted") {
    await recordAcceptedContribution(services, campaign, reviewed, auth.user.id, now);
  }
  return (await toDeliverableViews(store, collabs, [reviewed]))[0];
}

/** Creates (once) the verified campaign evidence for an accepted deliverable and issues what it earns. */
async function recordAcceptedContribution(
  services: Services,
  campaign: CampaignWithCounts,
  deliverable: DeliverableRecord,
  reviewerId: string,
  now: Date,
) {
  const store = requireStore(services);
  let evidenceId: string;
  try {
    const created = await store.createEvidence({
      userId: deliverable.creatorId,
      kind: "campaign-deliverable",
      method: "campaign-acceptance",
      status: "pending",
      title: `Campaign: ${campaign.title}`,
      summary: `Deliverable accepted by ${campaign.projectName}.`,
      reference: deliverable.id,
      // One contribution per deliverable, ever.
      dedupeKey: `campaign:deliverable:${deliverable.id}`,
      chainId: null,
      txHash: null,
      appId: null,
      category: categoryForEvidence["campaign-deliverable"],
      occurredAt: deliverable.createdAt,
      statusReason: null,
      verificationData: null,
    });
    evidenceId = created.id;
  } catch (error) {
    if (error instanceof DuplicateEvidenceError) return;
    throw error;
  }
  await store.updateEvidenceIfStatus(evidenceId, "pending", {
    status: "verified",
    statusReason: `Accepted by the campaign owner. Content hash ${deliverable.contentHash.slice(0, 10)}…`,
    reviewerId,
    reviewedAt: now,
    verifiedAt: now,
    verificationData: {
      campaignId: campaign.id,
      deliverableId: deliverable.id,
      contentHash: deliverable.contentHash,
      revision: deliverable.revision,
    },
  });
  await issueForEvidence(services, evidenceId, reviewerId);
}

/** Deliverables of one campaign for its owner, or the creator's own. */
export async function listDeliverablesFor(services: Services, auth: AuthContext, campaignId: string) {
  const collabs = requireCollabs(services);
  const store = requireStore(services);
  const campaign = await collabs.findCampaign(campaignId);
  if (!campaign) throw notFound("Campaign not found.");
  const all = await collabs.listDeliverables({ campaignId });
  const visible = campaign.ownerId === auth.user.id ? all : all.filter((item) => item.creatorId === auth.user.id);
  return toDeliverableViews(store, collabs, visible);
}
