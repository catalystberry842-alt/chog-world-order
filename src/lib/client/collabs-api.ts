/** Browser client for the Collab Board API. Same-origin; the session cookie is sent automatically. */
import type { ApplicationView, CampaignView, DeliverableView } from "@/lib/collabs/types";
import { ApiError } from "@/lib/client/passport-api";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
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
  if (!response.ok) throw new ApiError(response.status, body?.error?.code ?? "error", body?.error?.message ?? "Request failed.");
  return body as T;
}

const send = <T>(path: string, method: string, body: unknown) => call<T>(path, { method, body: JSON.stringify(body) });

export type CampaignFormInput = {
  projectName: string;
  title: string;
  summary: string;
  description: string;
  category: string;
  objectives: string[];
  deliverables: string[];
  eligibility: string[];
  acceptanceCriteria: string[];
  requiredSkills: string[];
  paymentToken: string;
  amountPerCreator: string;
  slots: number;
  deadline: string;
};

export type DashboardEntry = { campaign: CampaignView; applications: ApplicationView[]; deliverables: DeliverableView[] };

export const collabsApi = {
  dashboard: () => call<{ campaigns: DashboardEntry[] }>("/api/campaigns/mine"),
  create: (input: CampaignFormInput) => send<{ campaign: CampaignView }>("/api/campaigns", "POST", input),
  update: (id: string, input: CampaignFormInput) => send<{ campaign: CampaignView }>(`/api/campaigns/${id}`, "PATCH", input),
  publish: (id: string) => send<{ campaign: CampaignView }>(`/api/campaigns/${id}/publish`, "POST", {}),
  myParticipation: (campaignId: string) =>
    call<{ application: ApplicationView | null; deliverables: DeliverableView[] }>(`/api/campaigns/${campaignId}/applications`),
  apply: (campaignId: string, input: { proposal: string; evidenceIds: string[] }) =>
    send<{ application: ApplicationView }>(`/api/campaigns/${campaignId}/applications`, "POST", input),
  reviewApplication: (id: string, input: { decision: "accept" | "reject"; reason: string }) =>
    send<{ application: ApplicationView }>(`/api/applications/${id}/review`, "POST", input),
  submitDeliverable: (applicationId: string, input: { contentUrl: string; contentHash: string; notes?: string }) =>
    send<{ deliverable: DeliverableView }>(`/api/applications/${applicationId}/deliverables`, "POST", input),
  reviewDeliverable: (id: string, input: { decision: "accept" | "reject"; reason: string }) =>
    send<{ deliverable: DeliverableView }>(`/api/deliverables/${id}/review`, "POST", input),
};
