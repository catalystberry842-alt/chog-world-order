import { postEvidenceReview } from "@/server/api/handlers";
import { getServices } from "@/server/services";

export async function POST(request: Request, context: RouteContext<"/api/evidence/[id]/review">) {
  const { id } = await context.params;
  return postEvidenceReview(request, getServices(), id);
}
