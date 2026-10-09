import { getEvidence, postEvidence } from "@/server/api/handlers";
import { getServices } from "@/server/services";

export function GET(request: Request) {
  return getEvidence(request, getServices());
}

export function POST(request: Request) {
  return postEvidence(request, getServices());
}
