import { runIndexerRequest } from "@/server/api/collab-handlers";
import { getServices } from "@/server/services";

// Vercel Cron calls GET with `Authorization: Bearer <CRON_SECRET>`; POST works for other schedulers.
export function GET(request: Request) {
  return runIndexerRequest(request, getServices());
}

export function POST(request: Request) {
  return runIndexerRequest(request, getServices());
}
