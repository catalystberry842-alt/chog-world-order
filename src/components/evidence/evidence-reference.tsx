import type { EvidenceReference as Reference } from "@/lib/passport/types";

/** Pointer to the evidence. External links open in a new tab without referrer. */
export function EvidenceReference({
  reference,
  tone = "night",
  className = "",
}: {
  reference: Reference;
  /** "paper" for cream stamp pages, "night" for dark surfaces. */
  tone?: "night" | "paper";
  className?: string;
}) {
  const mono = reference.txHash ? "font-mono" : "";
  if (reference.url) {
    return (
      <a
        href={reference.url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className={`break-all underline-offset-2 hover:underline ${tone === "paper" ? "font-medium text-monad-700" : "text-monad-300 hover:text-monad-200"} ${mono} ${className}`}
      >
        {reference.label}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    );
  }
  return <span className={`break-all ${mono} ${className}`}>{reference.label}</span>;
}
