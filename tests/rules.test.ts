import { describe, expect, it } from "vitest";
import { isoWeekKey, planIssuance } from "@/lib/passport/rules";

describe("isoWeekKey", () => {
  it.each([
    ["2026-01-01", "2026-W01"],
    ["2026-12-31", "2026-W53"],
    ["2027-01-03", "2026-W53"],
    ["2026-10-05", "2026-W41"],
    ["2026-10-11", "2026-W41"],
  ])("%s is %s", (day, key) => {
    expect(isoWeekKey(new Date(`${day}T12:00:00Z`))).toBe(key);
  });
});

describe("planIssuance", () => {
  const evidence = { id: "e1", kind: "code-contribution" as const, occurredAt: new Date("2026-09-01T00:00:00Z") };

  it("credits a first verified contribution and its category stamp", () => {
    const plan = planIssuance({ evidence, verifiedSoFar: [evidence], heldStamps: new Set(), alreadyCredited: false });
    expect(plan.stamps).toEqual([{ category: "builder", evidenceId: "e1" }]);
    expect(plan.reputation.map((event) => event.kind)).toEqual(["contribution-verified", "stamp-issued"]);
  });

  it("plans nothing when the evidence is already credited and the stamp is held", () => {
    const plan = planIssuance({ evidence, verifiedSoFar: [evidence], heldStamps: new Set(["builder"]), alreadyCredited: true });
    expect(plan).toEqual({ stamps: [], reputation: [] });
  });
});
