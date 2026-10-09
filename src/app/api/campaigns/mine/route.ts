import { getMyCampaigns } from "@/server/api/collab-handlers";
import { getServices } from "@/server/services";

export function GET(request: Request) {
  return getMyCampaigns(request, getServices());
}
