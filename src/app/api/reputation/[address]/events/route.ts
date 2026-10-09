import { getReputationEvents } from "@/server/api/handlers";
import { getServices } from "@/server/services";

export async function GET(request: Request, context: RouteContext<"/api/reputation/[address]/events">) {
  const { address } = await context.params;
  return getReputationEvents(request, getServices(), address);
}
