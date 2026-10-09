import { postDeliverable } from "@/server/api/collab-handlers";
import { getServices } from "@/server/services";

export async function POST(request: Request, context: RouteContext<"/api/applications/[id]/deliverables">) {
  return postDeliverable(request, getServices(), (await context.params).id);
}
