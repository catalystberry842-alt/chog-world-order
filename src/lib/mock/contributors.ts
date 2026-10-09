/**
 * MOCK DATA — sample contributors used for the labelled sample passports.
 *
 * Every person, handle, and bio below is invented. Addresses follow the
 * obviously-fake pattern 0xc406…00NN so they are never mistaken for real
 * wallets. Real passports come from the database (see src/server).
 */
import type { Address } from "@/lib/types";

export type MockContributor = {
  address: Address;
  handle: string;
  displayName: string;
  bio: string;
  skills: string[];
  joined: string;
  avatarHue: number;
};

export const mockContributors: MockContributor[] = [
  {
    address: "0xc406000000000000000000000000000000000001",
    handle: "marginnote",
    displayName: "Margin Note",
    bio: "Illustrator drawing the Monad ecosystem one crayon at a time. Designs stamp art and onboarding comics.",
    skills: ["Illustration", "Comics", "Brand systems"],
    joined: "2026-03-02",
    avatarHue: 268,
  },
  {
    address: "0xc406000000000000000000000000000000000002",
    handle: "stampduty",
    displayName: "Stamp Duty",
    bio: "Solidity reviewer and testing nerd. Writes invariant tests for small teams before they ship.",
    skills: ["Solidity", "Foundry", "Security review"],
    joined: "2026-02-11",
    avatarHue: 318,
  },
  {
    address: "0xc406000000000000000000000000000000000003",
    handle: "pinkmargin",
    displayName: "Pink Margin",
    bio: "Community lead who runs weekly builder calls and turns them into searchable notes.",
    skills: ["Community", "Events", "Moderation"],
    joined: "2026-04-18",
    avatarHue: 330,
  },
  {
    address: "0xc406000000000000000000000000000000000004",
    handle: "nightscribble",
    displayName: "Night Scribble",
    bio: "Technical writer. Explains parallel execution to people who just want their swap to go through.",
    skills: ["Docs", "Tutorials", "Explainers"],
    joined: "2026-01-27",
    avatarHue: 248,
  },
  {
    address: "0xc406000000000000000000000000000000000005",
    handle: "gasgarden",
    displayName: "Gas Garden",
    bio: "Data analyst charting network activity, gas trends, and dapp retention across Monad.",
    skills: ["Dune", "SQL", "Research"],
    joined: "2026-05-09",
    avatarHue: 160,
  },
  {
    address: "0xc406000000000000000000000000000000000006",
    handle: "purplepixel",
    displayName: "Purple Pixel",
    bio: "Frontend developer building wallet UX components and open-source starter kits.",
    skills: ["React", "wagmi", "UI engineering"],
    joined: "2026-03-30",
    avatarHue: 200,
  },
  {
    address: "0xc406000000000000000000000000000000000007",
    handle: "loopclip",
    displayName: "Loop Clip",
    bio: "Video editor making 60-second explainers and event recaps for Monad projects.",
    skills: ["Video", "Motion", "Storyboarding"],
    joined: "2026-06-14",
    avatarHue: 24,
  },
  {
    address: "0xc406000000000000000000000000000000000008",
    handle: "quietfork",
    displayName: "Quiet Fork",
    bio: "New contributor translating docs into Portuguese and Spanish.",
    skills: ["Translation", "Localization"],
    joined: "2026-08-21",
    avatarHue: 48,
  },
];
