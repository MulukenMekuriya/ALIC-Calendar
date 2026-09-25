import { describe, it, expect } from "vitest";
import { defaultCollector } from "./pickupDefault";
import type { PickupCandidate } from "./checkInMachine";

function person(
  id: string,
  opts: Partial<PickupCandidate> = {},
): PickupCandidate {
  return {
    person_id: id,
    display_name: id,
    relationship: "Parent",
    is_authorized: false,
    is_guardian: true,
    child_has_restriction: false,
    dropped_off: false,
    ...opts,
  };
}

describe("defaultCollector", () => {
  it("offers the person who brought them", () => {
    const list = [person("mum", { dropped_off: true }), person("dad")];
    expect(defaultCollector([list], [person("mum"), person("dad")])).toBe("mum");
  });

  it("offers them when they brought EVERY child", () => {
    const a = [person("mum", { dropped_off: true }), person("dad")];
    const b = [person("mum", { dropped_off: true }), person("dad")];
    expect(defaultCollector([a, b], [person("mum"), person("dad")])).toBe("mum");
  });

  it("offers nobody when two people brought different children", () => {
    // A mother brought one and a father the other. There is no single right
    // answer, and guessing puts a name in front of a volunteer that is wrong
    // for half the family.
    const a = [person("mum", { dropped_off: true }), person("dad")];
    const b = [person("mum"), person("dad", { dropped_off: true })];
    expect(defaultCollector([a, b], [person("mum"), person("dad")])).toBeNull();
  });

  it("offers nobody when one child's dropper was not recorded", () => {
    const a = [person("mum", { dropped_off: true })];
    const b = [person("mum")];
    expect(defaultCollector([a, b], [person("mum")])).toBeNull();
  });

  it("NEVER offers a default when a child has a pickup restriction", () => {
    // Custody records. Pre-filling a name here invites somebody to tap
    // through the one case that most needs a person to stop and read.
    const list = [
      person("mum", { dropped_off: true, child_has_restriction: true }),
    ];
    expect(
      defaultCollector([list], [person("mum", { child_has_restriction: true })]),
    ).toBeNull();
  });

  it("refuses a restriction on ANY child, not only the first", () => {
    const a = [person("mum", { dropped_off: true })];
    const b = [person("mum", { dropped_off: true, child_has_restriction: true })];
    expect(defaultCollector([a, b], [person("mum")])).toBeNull();
  });

  it("never offers somebody outside the intersection", () => {
    // The dropper-off is not authorised for the sibling, so they are not in
    // the intersection and must not be offered for the pair.
    const a = [person("gran", { dropped_off: true }), person("mum")];
    const b = [person("mum")];
    expect(defaultCollector([a, b], [person("mum")])).toBeNull();
  });

  it("offers nobody when nobody is eligible at all", () => {
    expect(defaultCollector([[]], [])).toBeNull();
    expect(defaultCollector([], [])).toBeNull();
  });

  it("tolerates the flag being absent, as it is on an unpatched response", () => {
    const list = [person("mum"), person("dad")];
    expect(defaultCollector([list], list)).toBeNull();
  });
});
