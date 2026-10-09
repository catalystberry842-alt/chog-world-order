import { getCampaignDeliverables } from "@/server/api/collab-handlers";
import { getServices } from "@/server/services";

export async function GET(request: Request, context: RouteContext<"/api/campaigns/[id]/deliverables">) {
  return getCampaignDeliverables(request, getServices(), (await context.params).id);
}
