import type { Instrumentation } from "next";

/**
 * Reports server errors Next.js captures (rendering, route handlers, server
 * actions) as structured logs and, if configured, alerts. Only the path,
 * method, and route are forwarded: request headers carry the session cookie.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { alert } = await import("@/server/log");
  const digest = typeof error === "object" && error !== null && "digest" in error ? String(error.digest) : undefined;
  await alert("request.error", error, {
    path: request.path.split("?")[0],
    method: request.method,
    route: context.routePath,
    routeType: context.routeType,
    digest,
  });
};
