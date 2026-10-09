import { describe, expect, it } from "vitest";
import { isoWeekKey, planStamps } from "@/lib/passport/rules";

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

describe("planStamps", () => {
  const evidence = { id: "e1", kind: "code-contribution" as const, occurredAt: new Date("2026-09-01T00:00:00Z") };

  it("earns the category stamp for a first verified contribution", () => {
    expect(planStamps({ evidence, verifiedSoFar: [evidence], heldStamps: new Set() })).toEqual([
      { category: "builder", evidenceId: "e1" },
    ]);
  });

  it("plans nothing when the stamp is already held", () => {
    expect(planStamps({ evidence, verifiedSoFar: [evidence], heldStamps: new Set(["builder"]) })).toEqual([]);
  });
});
