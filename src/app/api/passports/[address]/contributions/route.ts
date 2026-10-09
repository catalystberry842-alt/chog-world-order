import { getPassportContributions } from "@/server/api/handlers";
import { getServices } from "@/server/services";

export async function GET(request: Request, context: RouteContext<"/api/passports/[address]/contributions">) {
  const { address } = await context.params;
  return getPassportContributions(request, getServices(), address);
}
