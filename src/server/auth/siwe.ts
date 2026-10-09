import { getAddress, isHex, type Hex } from "viem";
import { generateSiweNonce, parseSiweMessage, validateSiweMessage } from "viem/siwe";
import { monad } from "viem/chains";
import { badRequest, conflict, NonceReusedError, serviceUnavailable } from "@/server/errors";
import type { Services } from "@/server/services";
import { randomToken, sha256, signValue, unsignValue } from "@/server/auth/crypto";
import { NONCE_COOKIE, readCookie, serializeCookie, SESSION_COOKIE } from "@/server/auth/cookies";

const NONCE_TTL_SECONDS = 10 * 60;
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_MESSAGE_AGE_MS = 10 * 60 * 1000;

function originOf(uri: string) {
  try {
    return new URL(uri).origin;
  } catch {
    return null;
  }
}

function requireAuthConfig(services: Services) {
  const { appOrigin, sessionSecret } = services.config;
  if (!appOrigin || !sessionSecret) {
    throw serviceUnavailable("Wallet sign-in is not configured on this server (APP_ORIGIN and SESSION_SECRET).");
  }
  return { appOrigin, sessionSecret, secure: appOrigin.startsWith("https://") };
}

/** Issues a one-time nonce, bound to this browser by a signed, HttpOnly cookie. */
export function issueNonce(services: Services) {
  const { sessionSecret, secure } = requireAuthConfig(services);
  const nonce = generateSiweNonce();
  const expiresAt = services.now().getTime() + NONCE_TTL_SECONDS * 1000;
  const cookie = serializeCookie(NONCE_COOKIE, signValue(sessionSecret, `${nonce}:${expiresAt}`), {
    maxAge: NONCE_TTL_SECONDS,
    path: "/api/auth",
    secure,
    sameSite: "Strict",
  });
  return { nonce, cookie };
}

/**
 * Verifies a Sign-In with Ethereum (EIP-4361) message and opens a session.
 * The wallet address comes only from the signed message, never from other
 * request fields.
 */
export async function signIn(request: Request, input: { message: string; signature: string }, services: Services) {
  const { appOrigin, sessionSecret, secure } = requireAuthConfig(services);
  if (!services.store) throw serviceUnavailable("The Passport service is not configured on this server.");
  const now = services.now();

  const signed = unsignValue(sessionSecret, readCookie(request, NONCE_COOKIE));
  const [cookieNonce, cookieExpiry] = signed?.split(":") ?? [];
  if (!cookieNonce || !cookieExpiry || Number(cookieExpiry) < now.getTime()) {
    throw badRequest("Your sign-in request expired. Please try again.", "nonce_expired");
  }

  const message = parseSiweMessage(input.message);
  const { host } = new URL(appOrigin);
  const valid =
    message.address &&
    message.version === "1" &&
    message.chainId === monad.id &&
    message.uri !== undefined &&
    originOf(message.uri) === appOrigin &&
    message.issuedAt !== undefined &&
    Math.abs(now.getTime() - message.issuedAt.getTime()) <= MAX_MESSAGE_AGE_MS &&
    validateSiweMessage({ message, domain: host, nonce: cookieNonce, time: now });
  if (!valid || !message.address) {
    throw badRequest("The sign-in message is invalid for this site.", "invalid_message");
  }
  if (!isHex(input.signature)) throw badRequest("The signature is malformed.", "invalid_signature");

  const address = getAddress(message.address);
  const ok = await services
    .verifySignature({ address, message: input.message, signature: input.signature as Hex })
    .catch(() => false);
  if (!ok) throw badRequest("The signature does not match the wallet in the message.", "invalid_signature");

  const user = await services.store.upsertUser(address.toLowerCase() as typeof address);
  const token = randomToken();
  try {
    await services.store.createSession({
      userId: user.id,
      tokenHash: sha256(token),
      nonce: cookieNonce,
      chainId: monad.id,
      expiresAt: new Date(now.getTime() + SESSION_TTL_SECONDS * 1000),
    });
  } catch (error) {
    if (error instanceof NonceReusedError) throw conflict("nonce_used", error.message);
    throw error;
  }

  return {
    user,
    cookies: [
      serializeCookie(SESSION_COOKIE, token, { maxAge: SESSION_TTL_SECONDS, path: "/", secure, sameSite: "Lax" }),
      serializeCookie(NONCE_COOKIE, "", { maxAge: 0, path: "/api/auth", secure, sameSite: "Strict" }),
    ],
  };
}

export function clearSessionCookie(services: Services) {
  const secure = services.config.appOrigin?.startsWith("https://") ?? true;
  return serializeCookie(SESSION_COOKIE, "", { maxAge: 0, path: "/", secure, sameSite: "Lax" });
}
