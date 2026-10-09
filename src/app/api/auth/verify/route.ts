import { postSignIn } from "@/server/api/handlers";
import { getServices } from "@/server/services";

export function POST(request: Request) {
  return postSignIn(request, getServices());
}
