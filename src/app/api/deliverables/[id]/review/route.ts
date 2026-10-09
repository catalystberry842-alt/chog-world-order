import { postDeliverableReview } from "@/server/api/collab-handlers";
import { getServices } from "@/server/services";

export async function POST(request: Request, context: RouteContext<"/api/deliverables/[id]/review">) {
  return postDeliverableReview(request, getServices(), (await context.params).id);
}
