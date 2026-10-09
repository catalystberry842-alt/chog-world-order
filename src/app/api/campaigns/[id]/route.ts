import { getCampaignById, patchCampaign } from "@/server/api/collab-handlers";
import { getServices } from "@/server/services";

export async function GET(request: Request, context: RouteContext<"/api/campaigns/[id]">) {
  return getCampaignById(request, getServices(), (await context.params).id);
}

export async function PATCH(request: Request, context: RouteContext<"/api/campaigns/[id]">) {
  return patchCampaign(request, getServices(), (await context.params).id);
}
