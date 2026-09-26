import { describe, it, expect } from "vitest";
import { EVERYONE, STAFF_ONLY, filterRoster, holdsAJob } from "./roster";

const person = (full_name: string, email: string, role: string, ministry?: string) => ({
  full_name,
  email,
  ministry_name: ministry ?? null,
  user_roles: [{ role }],
});

const roster = [
  person("Abel Alic", "abel@alic.org", "admin"),
  person("Seblewengel Mengistu", "finance@addislidetchurch.com", "finance", "ALIC MD Finance"),
  person("A Board Member", "board@alic.org", "board"),
  person("Tigist Yaie", "tigistyaie@gmail.com", "member"),
  person("Amelework Belay", "amelesewalem89@gmail.com", "member"),
];

describe("filterRoster", () => {
  it("opens on the people who have a job", () => {
    expect(filterRoster(roster, STAFF_ONLY, "").map((p) => p.full_name)).toEqual([
      "Abel Alic",
      "Seblewengel Mengistu",
      "A Board Member",
    ]);
  });

  it("shows the congregation when asked", () => {
    expect(filterRoster(roster, EVERYONE, "")).toHaveLength(5);
  });

  it("narrows to one tier", () => {
    expect(filterRoster(roster, "member", "").map((p) => p.full_name)).toEqual([
      "Tigist Yaie",
      "Amelework Belay",
    ]);
  });

  it("finds a member by name once members are showing", () => {
    // The point of the search: promoting one of the 589 means finding them
    // first, and they are hidden by default.
    expect(filterRoster(roster, EVERYONE, "tigist").map((p) => p.full_name)).toEqual([
      "Tigist Yaie",
    ]);
    expect(filterRoster(roster, STAFF_ONLY, "tigist")).toHaveLength(0);
  });

  it("searches email and ministry too, ignoring case and stray spaces", () => {
    expect(filterRoster(roster, EVERYONE, "  ADDISLIDET ")).toHaveLength(1);
    expect(filterRoster(roster, EVERYONE, "md finance").map((p) => p.full_name)).toEqual([
      "Seblewengel Mengistu",
    ]);
  });

  it("treats a row with no tier as a member, not as staff", () => {
    const stray = [{ full_name: "No Tier", email: "x@y.z", user_roles: [] }];
    expect(filterRoster(stray, STAFF_ONLY, "")).toHaveLength(0);
    expect(filterRoster(stray, EVERYONE, "")).toHaveLength(1);
  });

  it("survives the roster not having arrived yet", () => {
    expect(filterRoster(undefined, STAFF_ONLY, "")).toEqual([]);
  });
});

describe("holdsAJob", () => {
  it("is every tier except member", () => {
    expect(holdsAJob("admin")).toBe(true);
    expect(holdsAJob("board")).toBe(true);
    expect(holdsAJob("member")).toBe(false);
    expect(holdsAJob(null)).toBe(false);
  });
});
