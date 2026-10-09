/** An error that maps directly to an HTTP response. Messages are safe to show to clients. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const unauthorized = (message = "Sign in with your wallet first.") =>
  new HttpError(401, "unauthorized", message);
export const forbidden = (message = "You are not allowed to do that.") => new HttpError(403, "forbidden", message);
export const notFound = (message = "Not found.") => new HttpError(404, "not_found", message);
export const conflict = (code: string, message: string) => new HttpError(409, code, message);
export const badRequest = (message: string, code = "invalid_request") => new HttpError(400, code, message);
export const serviceUnavailable = (message: string, code = "not_configured") =>
  new HttpError(503, code, message);

/** Thrown by stores when a unique constraint on evidence is hit. */
export class DuplicateEvidenceError extends Error {
  constructor() {
    super("This evidence has already been submitted.");
    this.name = "DuplicateEvidenceError";
  }
}

/** Thrown by stores when a sign-in nonce has already been used. */
export class NonceReusedError extends Error {
  constructor() {
    super("This sign-in message has already been used.");
    this.name = "NonceReusedError";
  }
}
