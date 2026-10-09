import { getReputationByAddress } from "@/server/api/handlers";
import { getServices } from "@/server/services";

export async function GET(request: Request, context: RouteContext<"/api/reputation/[address]">) {
  const { address } = await context.params;
  return getReputationByAddress(request, getServices(), address);
}
