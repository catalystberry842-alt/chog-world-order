import type { EvidenceKind, StampCategory, VerificationMethod } from "@/lib/passport/types";

export type StampMotif = "compass" | "megaphone" | "code" | "lens" | "links" | "calendar";
export type StampColor = "purple" | "pink" | "mint" | "sky" | "yellow" | "orange";

export type StampDefinition = {
  category: StampCategory;
  name: string;
  description: string;
  /** Plain-language rule for earning the stamp. */
  criteria: string;
  motif: StampMotif;
  color: StampColor;
};

/** Distinct ISO weeks with verified contributions needed for Consistent Contributor. */
export const consistentContributorWeeks = 4;

export const stampCatalogue: Record<StampCategory, StampDefinition> = {
  "monad-explorer": {
    category: "monad-explorer",
    name: "Monad Explorer",
    description: "Verified interaction with a supported Monad application.",
    criteria: "One on-chain transaction to a supported app, checked against its receipt and events.",
    motif: "compass",
    color: "sky",
  },
  "community-contributor": {
    category: "community-contributor",
    name: "Community Contributor",
    description: "Approved community contribution: events, guides, art, translations, moderation.",
    criteria: "One community contribution approved by an authorized reviewer.",
    motif: "megaphone",
    color: "pink",
  },
  builder: {
    category: "builder",
    name: "Builder",
    description: "Verified code contribution to a Monad project.",
    criteria: "One code contribution approved by a maintainer.",
    motif: "code",
    color: "purple",
  },
  researcher: {
    category: "researcher",
    name: "Researcher",
    description: "Approved research or technical analysis.",
    criteria: "One research report or analysis approved by an authorized reviewer.",
    motif: "lens",
    color: "mint",
  },
  collaborator: {
    category: "collaborator",
    name: "Collaborator",
    description: "Accepted work from a completed Collab Board campaign.",
    criteria: "One campaign deliverable accepted by the project that posted it.",
    motif: "links",
    color: "yellow",
  },
  "consistent-contributor": {
    category: "consistent-contributor",
    name: "Consistent Contributor",
    description: `Verified contributions in ${consistentContributorWeeks} different weeks.`,
    criteria: `Verified contributions in ${consistentContributorWeeks} distinct ISO weeks (UTC).`,
    motif: "calendar",
    color: "orange",
  },
};

export const orderedStamps = Object.values(stampCatalogue);

/** The category stamp each kind of evidence can earn. */
export const stampForEvidenceKind: Record<EvidenceKind, StampCategory> = {
  "onchain-interaction": "monad-explorer",
  "community-contribution": "community-contributor",
  "code-contribution": "builder",
  "research-contribution": "researcher",
  "campaign-deliverable": "collaborator",
};

export const methodForEvidenceKind: Record<EvidenceKind, VerificationMethod> = {
  "onchain-interaction": "onchain-receipt",
  "community-contribution": "reviewer-approval",
  "code-contribution": "maintainer-approval",
  "research-contribution": "reviewer-approval",
  "campaign-deliverable": "campaign-acceptance",
};
