import { postApplicationReview } from "@/server/api/collab-handlers";
import { getServices } from "@/server/services";

export async function POST(request: Request, context: RouteContext<"/api/applications/[id]/review">) {
  return postApplicationReview(request, getServices(), (await context.params).id);
}
