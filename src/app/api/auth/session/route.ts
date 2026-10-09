import { getSession } from "@/server/api/handlers";
import { getServices } from "@/server/services";

export function GET(request: Request) {
  return getSession(request, getServices());
}
