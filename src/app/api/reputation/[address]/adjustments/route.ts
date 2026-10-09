import { postAdjustment } from "@/server/api/handlers";
import { getServices } from "@/server/services";

export async function POST(request: Request, context: RouteContext<"/api/reputation/[address]/adjustments">) {
  const { address } = await context.params;
  return postAdjustment(request, getServices(), address);
}
