import { badRequest } from "@/server/errors";

/** Tracking parameters that never identify content, on any host. */
const trackingParams = /^(utm_|fbclid$|gclid$|igshid$|mc_cid$|mc_eid$|ref_src$)/i;
/**
 * Short parameters that are tracking on social hosts but content ids elsewhere
 * (a forum's `?t=123` is a thread), so they are stripped only on these hosts.
 */
const socialHosts = new Set(["x.com", "youtube.com", "youtu.be", "instagram.com", "github.com", "warpcast.com", "medium.com"]);
const socialTrackingParams = /^(s|t|si|ref)$/i;

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
  const bareHost = url.hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
  const host = hostAliases[bareHost] ?? bareHost;
  for (const key of [...url.searchParams.keys()]) {
    if (trackingParams.test(key) || (socialHosts.has(host) && socialTrackingParams.test(key))) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  let path = decodeUnreserved(url.pathname).replace(/\/{2,}/g, "/").replace(/\/+$/, "") || "/";
  path = foldCase(host, path);
  // X ignores the user name in a status link, so any name points at the same post.
  const status = host === "x.com" ? path.match(/^\/[^/]+\/status\/(\d+)(?:\/.*)?$/) : null;
  if (status) return `https://x.com/i/status/${status[1]}`;
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
  const [path] = canonical.split("?");
  const pull = path.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:pull|issues)\/(\d+)(?:\.(?:patch|diff))?(?:\/.*)?$/i);
  if (pull) {
    const [, owner, repo, number] = pull;
    // GitHub serves a pull request at /issues/<n> too.
    return `https://github.com/${owner}/${repo}/pull/${BigInt(number).toString()}`;
  }
  const commit = path.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/commit\/([0-9a-f]+)(?:\.(?:patch|diff))?(?:\/.*)?$/i);
  if (commit) {
    const [, owner, repo, sha] = commit;
    if (sha.length !== 40) {
      throw badRequest("Link the full commit (40-character SHA), not a shortened one.", "invalid_reference");
    }
    return `https://github.com/${owner}/${repo}/commit/${sha.toLowerCase()}`;
  }
  return canonical;
}
