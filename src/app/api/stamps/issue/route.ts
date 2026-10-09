import { postIssueStamps } from "@/server/api/handlers";
import { getServices } from "@/server/services";

export function POST(request: Request) {
  return postIssueStamps(request, getServices());
}
