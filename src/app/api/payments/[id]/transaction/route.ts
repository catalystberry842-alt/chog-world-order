import { postPaymentTransaction } from "@/server/api/collab-handlers";
import { getServices } from "@/server/services";

export async function POST(request: Request, context: RouteContext<"/api/payments/[id]/transaction">) {
  return postPaymentTransaction(request, getServices(), (await context.params).id);
}
