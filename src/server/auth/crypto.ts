import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const randomToken = () => randomBytes(32).toString("base64url");

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

const hmac = (secret: string, value: string) => createHmac("sha256", secret).update(value).digest("base64url");

/** "value.signature" */
export function signValue(secret: string, value: string) {
  return `${value}.${hmac(secret, value)}`;
}

/** Returns the value when the signature matches, otherwise null. Constant-time comparison. */
export function unsignValue(secret: string, signed: string | undefined | null): string | null {
  if (!signed) return null;
  const index = signed.lastIndexOf(".");
  if (index <= 0) return null;
  const value = signed.slice(0, index);
  const given = Buffer.from(signed.slice(index + 1));
  const expected = Buffer.from(hmac(secret, value));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return value;
}
