import { postRegistration } from "@/server/api/collab-handlers";
import { getServices } from "@/server/services";

export async function POST(request: Request, context: RouteContext<"/api/campaigns/[id]/registration">) {
  return postRegistration(request, getServices(), (await context.params).id);
}
