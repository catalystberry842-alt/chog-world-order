import { getCampaigns, postCampaign } from "@/server/api/collab-handlers";
import { getServices } from "@/server/services";

export function GET(request: Request) {
  return getCampaigns(request, getServices());
}

export function POST(request: Request) {
  return postCampaign(request, getServices());
}
