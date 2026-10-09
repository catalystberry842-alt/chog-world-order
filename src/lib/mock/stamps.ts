/**
 * MOCK DATA — Passport stamp catalogue and sample awards for Phase 1.
 *
 * Stamp definitions describe the intended rules. Awards are invented: nobody
 * has actually earned these stamps, and none of them are minted on-chain.
 */
import type { StampAward, StampDefinition } from "@/lib/types";

export const stampCatalogue: StampDefinition[] = [
  {
    id: "first-steps",
    name: "First Steps",
    description: "Opened a passport and logged a first contribution.",
    criteria: "Have one contribution accepted by a reviewer.",
    motif: "chog",
    color: "purple",
    tier: "common",
    category: "milestone",
  },
  {
    id: "builder",
    name: "Builder",
    description: "Shipped code that other people in the ecosystem use.",
    criteria: "Three reviewed development contributions.",
    motif: "code",
    color: "sky",
    tier: "common",
    category: "development",
  },
  {
    id: "crayon-artist",
    name: "Crayon Artist",
    description: "Made original art for the Monad community.",
    criteria: "Three reviewed design contributions.",
    motif: "brush",
    color: "pink",
    tier: "common",
    category: "design",
  },
  {
    id: "storyteller",
    name: "Storyteller",
    description: "Wrote guides, threads, or docs that taught someone something.",
    criteria: "Three reviewed content contributions.",
    motif: "quill",
    color: "yellow",
    tier: "common",
    category: "content",
  },
  {
    id: "town-crier",
    name: "Town Crier",
    description: "Hosted spaces, calls, or meetups that brought people together.",
    criteria: "Host three community events with published notes.",
    motif: "megaphone",
    color: "orange",
    tier: "common",
    category: "community",
  },
  {
    id: "cartographer",
    name: "Cartographer",
    description: "Mapped the ecosystem with data and research.",
    criteria: "Two reviewed research reports.",
    motif: "lens",
    color: "mint",
    tier: "rare",
    category: "research",
  },
  {
    id: "first-collab",
    name: "First Collab",
    description: "Completed a paid campaign from the Collab Board.",
    criteria: "One campaign submission accepted and paid.",
    motif: "links",
    color: "mint",
    tier: "common",
    category: "collab",
  },
  {
    id: "reliable-hand",
    name: "Reliable Hand",
    description: "Delivered campaign work on time, again and again.",
    criteria: "Three accepted campaign submissions, all before deadline.",
    motif: "star",
    color: "yellow",
    tier: "rare",
    category: "collab",
  },
  {
    id: "parallel-mind",
    name: "Parallel Mind",
    description: "Contributed across three or more categories.",
    criteria: "Reviewed contributions in three different categories.",
    motif: "lightning",
    color: "purple",
    tier: "rare",
    category: "milestone",
  },
  {
    id: "chog-heart",
    name: "Chog Heart",
    description: "Recognised by peers for helping others contribute.",
    criteria: "Nominated by five contributors who hold a passport.",
    motif: "heart",
    color: "pink",
    tier: "legendary",
    category: "milestone",
  },
];

const award = (stampId: string, holderSuffix: string, awardedOn: string): StampAward => ({
  stampId,
  holder: `0xc4060000000000000000000000000000000000${holderSuffix}`,
  awardedOn,
  minted: false,
  source: "mock",
});

export const mockStampAwards: StampAward[] = [
  award("first-steps", "01", "2026-03-10"),
  award("crayon-artist", "01", "2026-05-22"),
  award("first-collab", "01", "2026-06-03"),
  award("reliable-hand", "01", "2026-09-01"),
  award("parallel-mind", "01", "2026-08-12"),
  award("chog-heart", "01", "2026-09-28"),

  award("first-steps", "02", "2026-02-20"),
  award("builder", "02", "2026-04-15"),
  award("first-collab", "02", "2026-05-30"),
  award("reliable-hand", "02", "2026-08-30"),

  award("first-steps", "03", "2026-04-25"),
  award("town-crier", "03", "2026-06-20"),
  award("first-collab", "03", "2026-07-19"),

  award("first-steps", "04", "2026-02-03"),
  award("storyteller", "04", "2026-03-28"),
  award("first-collab", "04", "2026-04-12"),
  award("reliable-hand", "04", "2026-07-05"),
  award("parallel-mind", "04", "2026-08-02"),

  award("first-steps", "05", "2026-05-15"),
  award("cartographer", "05", "2026-08-08"),

  award("first-steps", "06", "2026-04-04"),
  award("builder", "06", "2026-07-11"),
  award("first-collab", "06", "2026-08-17"),

  award("first-steps", "07", "2026-06-20"),
  award("first-collab", "07", "2026-09-09"),

  award("first-steps", "08", "2026-09-02"),
];
