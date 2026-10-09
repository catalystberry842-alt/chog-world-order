import { getStampCatalogue } from "@/server/api/handlers";

export function GET() {
  return getStampCatalogue();
}
