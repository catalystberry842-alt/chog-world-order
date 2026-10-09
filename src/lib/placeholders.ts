export type Contributor = {
  address: string;
  name: string;
  score: number;
  focus: string;
};

export type CollabBrief = {
  title: string;
  craft: string;
  status: "Open" | "Claimed";
  note: string;
};

export const sampleContributors: Contributor[] = [
  {
    address: "0xc406000000000000000000000000000000000001",
    name: "Margin Note",
    score: 128,
    focus: "Passport sketches",
  },
  {
    address: "0xc406000000000000000000000000000000000002",
    name: "Stamp Duty",
    score: 96,
    focus: "Contributor reviews",
  },
  {
    address: "0xc406000000000000000000000000000000000003",
    name: "Pink Margin",
    score: 74,
    focus: "Collab briefs",
  },
  {
    address: "0xc406000000000000000000000000000000000004",
    name: "Night Scribble",
    score: 51,
    focus: "Monad field notes",
  },
];

export const sampleBriefs: CollabBrief[] = [
  {
    title: "Passport cover pass",
    craft: "Illustration",
    status: "Open",
    note: "A crayon cover for the first passport sheet.",
  },
  {
    title: "Leaderboard voice",
    craft: "Writing",
    status: "Open",
    note: "Explain reputation without sounding like a points farm.",
  },
  {
    title: "Meetup recap",
    craft: "Community",
    status: "Claimed",
    note: "Turn one Monad night into a public contribution.",
  },
];

export const passportFields = [
  "Wallet address",
  "Display name",
  "Contributions",
  "Collabs completed",
  "Reputation",
  "Issued stamps",
] as const;

export function findContributor(address: string) {
  const key = address.toLowerCase();
  return sampleContributors.find((person) => person.address === key);
}
