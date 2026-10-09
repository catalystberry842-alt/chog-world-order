import { getPassportByAddress } from "@/server/api/handlers";
import { getServices } from "@/server/services";

export async function GET(request: Request, context: RouteContext<"/api/passports/[address]">) {
  const { address } = await context.params;
  return getPassportByAddress(request, getServices(), address);
}
