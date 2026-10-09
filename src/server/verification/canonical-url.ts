import { badRequest } from "@/server/errors";

const trackingParams = /^(utm_|ref$|ref_src$|fbclid$|gclid$|s$|t$)/;

/**
 * Canonical form of an evidence URL, used for duplicate detection. Two links
 * that point at the same thing (different case host, trailing slash, tracking
 * parameters, fragments) produce the same key.
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
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const query = url.searchParams.toString();
  return `https://${host}${path}${query ? `?${query}` : ""}`;
}

/** GitHub pull request, commit, or merged-change URL, normalised. */
export function canonicalCodeUrl(raw: string): string {
  const canonical = canonicalUrl(raw);
  const github = canonical.match(
    /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/(pull\/\d+|commit\/[0-9a-f]{7,40})(?:\/.*)?$/i,
  );
  if (github) {
    const [, owner, repo, target] = github;
    return `https://github.com/${owner.toLowerCase()}/${repo.toLowerCase()}/${target.toLowerCase()}`;
  }
  return canonical;
}
