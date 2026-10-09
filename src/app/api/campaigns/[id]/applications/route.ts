import { getMyApplication, postApplication } from "@/server/api/collab-handlers";
import { getServices } from "@/server/services";

export async function GET(request: Request, context: RouteContext<"/api/campaigns/[id]/applications">) {
  return getMyApplication(request, getServices(), (await context.params).id);
}

export async function POST(request: Request, context: RouteContext<"/api/campaigns/[id]/applications">) {
  return postApplication(request, getServices(), (await context.params).id);
}
