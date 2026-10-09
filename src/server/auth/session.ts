import { forbidden, HttpError, serviceUnavailable, unauthorized } from "@/server/errors";
import type { PassportStore, SessionRecord, UserRecord, UserRole } from "@/server/passport/store";
import type { Services } from "@/server/services";
import { sha256 } from "@/server/auth/crypto";
import { readCookie, SESSION_COOKIE } from "@/server/auth/cookies";

export type AuthContext = { user: UserRecord; session: SessionRecord };

export function requireStore(services: Services): PassportStore {
  if (!services.store) {
    throw serviceUnavailable("The Passport service is not configured on this server (DATABASE_URL is missing).");
  }
  return services.store;
}

/** The signed-in wallet for this request, or null. Expired and revoked sessions count as signed out. */
export async function getAuth(request: Request, services: Services): Promise<AuthContext | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token || !services.store) return null;
  const found = await services.store.findSessionByTokenHash(sha256(token));
  if (!found) return null;
  const now = services.now();
  if (found.session.revokedAt || found.session.expiresAt <= now) return null;
  return found;
}

export async function requireAuth(request: Request, services: Services): Promise<AuthContext> {
  requireStore(services);
  const auth = await getAuth(request, services);
  if (!auth) throw unauthorized();
  return auth;
}

export function requireRole(user: UserRecord, roles: UserRole[]) {
  if (!roles.includes(user.role)) throw forbidden("Only authorized reviewers can do this.");
}

/**
 * Rejects cross-site writes. Browsers always send Origin on POST requests, so
 * a missing or different Origin means the request did not come from this app.
 */
export function assertSameOrigin(request: Request, services: Services) {
  const expected = services.config.appOrigin;
  if (!expected) throw serviceUnavailable("APP_ORIGIN is not configured on this server.");
  const origin = request.headers.get("origin");
  if (origin !== expected) throw new HttpError(403, "bad_origin", "Cross-site requests are not allowed.");
}
