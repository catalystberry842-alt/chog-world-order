import { getPayment } from "@/server/api/collab-handlers";
import { getServices } from "@/server/services";

export async function GET(request: Request, context: RouteContext<"/api/payments/[id]">) {
  return getPayment(request, getServices(), (await context.params).id);
}
