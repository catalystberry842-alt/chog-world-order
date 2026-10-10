import { getIndexerStatus } from "@/server/api/collab-handlers";
import { getServices } from "@/server/services";

// Requires `Authorization: Bearer <CRON_SECRET>`. For uptime monitors and the post-deployment checklist.
export function GET(request: Request) {
  return getIndexerStatus(request, getServices());
}
