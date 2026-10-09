import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { HttpError } from "@/server/errors";

const noStore = { "cache-control": "no-store" };

export function json(body: unknown, init: { status?: number; headers?: HeadersInit; cookies?: string[] } = {}) {
  const headers = new Headers({ ...noStore, ...Object.fromEntries(new Headers(init.headers)) });
  for (const cookie of init.cookies ?? []) headers.append("set-cookie", cookie);
  return Response.json(body, { status: init.status ?? 200, headers });
}

/** Converts thrown errors into JSON responses. Unknown errors never leak details. */
export async function handle(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    // Let Next.js handle its own control-flow errors (prerender bail-out, notFound, redirect).
    unstable_rethrow(error);
    if (error instanceof HttpError) {
      return json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    console.error("[api] unexpected error", error);
    return json({ error: { code: "internal_error", message: "Something went wrong." } }, { status: 500 });
  }
}

const MAX_BODY_BYTES = 16_384;

/** Reads and validates a JSON body. */
export async function readBody<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T>> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new HttpError(413, "too_large", "Request body is too large.");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be JSON.");
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.join(".");
    throw new HttpError(400, "invalid_request", path ? `${path}: ${issue.message}` : (issue?.message ?? "Invalid request."));
  }
  return parsed.data;
}
