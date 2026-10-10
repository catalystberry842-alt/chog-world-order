import { badRequest } from "@/server/errors";

const trackingParams = /^(utm_|ref$|ref_src$|fbclid$|gclid$|s$|t$|si$|igshid$|mc_cid$|mc_eid$)/i;

/** Hosts that serve the same content under another name. */
const hostAliases: Record<string, string> = {
  "twitter.com": "x.com",
  "mobile.twitter.com": "x.com",
  "mobile.x.com": "x.com",
};

/** Lowercases the path segments a host treats case-insensitively (handles, owner/repo names). */
function foldCase(host: string, path: string) {
  if (host === "x.com") return path.toLowerCase();
  if (host === "github.com") {
    const [, owner = "", repo = "", ...rest] = path.split("/");
    return ["", owner.toLowerCase(), repo.toLowerCase(), ...rest].join("/").replace(/\/+$/, "") || "/";
  }
  return path;
}

/** Decodes percent-escapes of unreserved characters (RFC 3986), so `%31` and `1` match. */
const decodeUnreserved = (path: string) =>
  path.replace(/%([0-9a-f]{2})/gi, (escape, hex: string) => {
    const char = String.fromCharCode(parseInt(hex, 16));
    return /[A-Za-z0-9\-._~]/.test(char) ? char : escape.toUpperCase();
  });

/**
 * Canonical form of an evidence URL, used for duplicate detection. Two links
 * that point at the same thing produce the same key: host case, `www.`, a
 * trailing dot, alias hosts, repeated or trailing slashes, escaped unreserved
 * characters, tracking parameters (any case), and fragments are normalised.
 */
export function canonicalUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw badRequest("Evidence must be a full link starting with https://.", "invalid_reference");
  }
  if (url.protocol !== "https:") {
    throw badRequest("Evidence links must use https://.", "invalid_reference");
  }
  if (url.username || url.password) {
    throw badRequest("Evidence links must not contain credentials.", "invalid_reference");
  }
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (trackingParams.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  const bareHost = url.hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
  const host = hostAliases[bareHost] ?? bareHost;
  let path = decodeUnreserved(url.pathname).replace(/\/{2,}/g, "/").replace(/\/+$/, "") || "/";
  path = foldCase(host, path);
  const query = url.searchParams.toString();
  return `https://${host}${path}${query ? `?${query}` : ""}`;
}

/**
 * GitHub pull request or commit URL, normalised: leading zeros dropped from
 * PR numbers, and only full 40-character commit SHAs accepted (a short SHA
 * has many spellings for one commit).
 */
export function canonicalCodeUrl(raw: string): string {
  const canonical = canonicalUrl(raw);
  const pull = canonical.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/.*)?$/);
  if (pull) {
    const [, owner, repo, number] = pull;
    return `https://github.com/${owner}/${repo}/pull/${BigInt(number).toString()}`;
  }
  const commit = canonical.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/commit\/([0-9a-f]+)(?:\/.*)?$/i);
  if (commit) {
    const [, owner, repo, sha] = commit;
    if (sha.length !== 40) {
      throw badRequest("Link the full commit (40-character SHA), not a shortened one.", "invalid_reference");
    }
    return `https://github.com/${owner}/${repo}/commit/${sha.toLowerCase()}`;
  }
  return canonical;
}
