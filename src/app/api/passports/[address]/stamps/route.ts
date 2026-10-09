import { getPassportStamps } from "@/server/api/handlers";
import { getServices } from "@/server/services";

export async function GET(request: Request, context: RouteContext<"/api/passports/[address]/stamps">) {
  const { address } = await context.params;
  return getPassportStamps(request, getServices(), address);
}
