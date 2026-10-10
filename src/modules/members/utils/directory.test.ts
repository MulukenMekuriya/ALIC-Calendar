import { describe, it, expect } from "vitest";
import {
  NO_FAMILY_FILTERS,
  NO_FILTERS,
  NO_STATUS,
  ageOrGrade,
  duplicateGroups,
  duplicateIds,
  filterFamilies,
  filterPeople,
  formatPhone,
  health,
  nameKey,
  sortFamilies,
  sortPeople,
  type DirectoryFamily,
  type DirectoryPerson,
} from "./directory";

let n = 0;
function person(p: Partial<DirectoryPerson> = {}): DirectoryPerson {
  n += 1;
  return {
    id: `p${n}`,
    first_name: "Hana",
    last_name: "Bekele",
    preferred_name: null,
    is_child: false,
    is_active: true,
    email: "hana@example.test",
    phone: "301-555-0101",
    gender: null,
    birth_year: null,
    birth_month: null,
    membership_status_id: "s-member",
    membership_code: "member",
    membership_name: "Member",
    household_id: "h1",
    household_name: "Bekele",
    grade_name: null,
    has_login: true,
    last_check_in: null,
    created_at: `2026-09-${String(n % 28 + 1).padStart(2, "0")}T00:00:00Z`,
    created_by_name: null,
    ...p,
  };
}

function family(f: Partial<DirectoryFamily> = {}): DirectoryFamily {
  n += 1;
  return {
    household_id: `h${n}`,
    name: "Bekele",
    city: null,
    primary_contact_id: null,
    primary_contact_name: "Hana Bekele",
    primary_phone: "301-555-0101",
    primary_email: "hana@example.test",
    adult_count: 2,
    child_count: 1,
    family_status: "member",
    last_check_in: null,
    created_at: "2026-09-01T00:00:00Z",
    ...f,
  };
}

describe("formatPhone and ageOrGrade", () => {
  it("writes a US number the familiar way and leaves anything else alone", () => {
    expect(formatPhone("3012564421")).toBe("(301) 256-4421");
    expect(formatPhone("+1 301-256-4421")).toBe("(301) 256-4421");
    expect(formatPhone("+251 911 234567")).toBe("+251 911 234567");
    expect(formatPhone(null)).toBe("");
  });

  it("gives a child's grade, else an age, else nothing", () => {
    expect(ageOrGrade(person({ is_child: true, grade_name: "3rd Grade" }))).toBe("3rd Grade");
    expect(ageOrGrade(person({ birth_year: 1990, birth_month: 1 }))).toMatch(/^\d+ yr$/);
    expect(ageOrGrade(person())).toBe("");
  });
});

describe("likely duplicates", () => {
  const a = person({ first_name: "Abel", last_name: "Tesfaye" });
  const b = person({ first_name: " abel ", last_name: "TESFAYE" });
  const c = person({ first_name: "Abel", last_name: "Tesfaye", is_active: false });
  const d = person({ first_name: "Ruth", last_name: "Alemu" });

  it("groups active people by name, ignoring case and spacing", () => {
    expect(nameKey(a)).toBe(nameKey(b));
    const groups = duplicateGroups([a, b, c, d]);
    expect(groups).toHaveLength(1);
    expect(groups[0].people.map((p) => p.id).sort()).toEqual([a.id, b.id].sort());
  });

  it("stops offering a group an admin has said are different people", () => {
    expect(duplicateGroups([a, b], [[a.id, b.id]])).toHaveLength(0);
  });

  it("offers it again when a third person with the name appears", () => {
    const e = person({ first_name: "Abel", last_name: "Tesfaye" });
    expect(duplicateGroups([a, b, e], [[a.id, b.id]])).toHaveLength(1);
  });
});

describe("health", () => {
  it("counts what each person is missing, adults and children asked different things", () => {
    const people = [
      person({ membership_status_id: null }),
      person({ email: null, phone: null }),
      person({ is_child: true, membership_status_id: null, email: null, phone: null, grade_name: null }),
      person({ household_id: null }),
      person({ membership_status_id: null, is_active: false }),
    ];
    const h = health(people, []);
    expect(h.adults).toBe(3);
    expect(h.children).toBe(1);
    // The child has no status, email or phone: children are not asked for them.
    expect(h.counts).toMatchObject({ no_status: 1, no_email: 1, no_phone: 1, no_grade: 1, no_family: 1, duplicate: 0 });
  });
});

describe("filterPeople", () => {
  const member = person({ first_name: "Selam", last_name: "Girma", email: "selam@x.test", phone: "(240) 871-8887", household_name: "Girma" });
  const visitor = person({ first_name: "Dawit", last_name: "Haile", membership_status_id: "s-visitor", membership_name: "Visitor", phone: null });
  const none = person({ first_name: "Meron", last_name: "Abebe", membership_status_id: null, membership_name: null });
  const child = person({ first_name: "Kidus", last_name: "Girma", is_child: true, membership_status_id: null });
  const gone = person({ first_name: "Old", last_name: "Record", is_active: false });
  const all = [member, visitor, none, child, gone];
  const ids = (rows: DirectoryPerson[]) => rows.map((r) => r.id);

  it("leaves inactive people out unless asked", () => {
    expect(ids(filterPeople(all, NO_FILTERS, new Set()))).not.toContain(gone.id);
    expect(ids(filterPeople(all, { ...NO_FILTERS, includeInactive: true }, new Set()))).toContain(gone.id);
  });

  it("filters by status, by no status, by adults and children, and by what is missing", () => {
    expect(ids(filterPeople(all, { ...NO_FILTERS, status: "s-visitor" }, new Set()))).toEqual([visitor.id]);
    expect(ids(filterPeople(all, { ...NO_FILTERS, status: NO_STATUS, type: "adults" }, new Set()))).toEqual([none.id]);
    expect(ids(filterPeople(all, { ...NO_FILTERS, type: "children" }, new Set()))).toEqual([child.id]);
    expect(ids(filterPeople(all, { ...NO_FILTERS, attention: "no_phone" }, new Set()))).toEqual([visitor.id]);
  });

  it("searches names, family and email, or phone digits", () => {
    expect(ids(filterPeople(all, { ...NO_FILTERS, search: "girma" }, new Set()))).toEqual([member.id, child.id]);
    expect(ids(filterPeople(all, { ...NO_FILTERS, search: "selam@" }, new Set()))).toEqual([member.id]);
    expect(ids(filterPeople(all, { ...NO_FILTERS, search: "871-8887" }, new Set()))).toEqual([member.id]);
  });
});

describe("sortPeople", () => {
  const a = person({ last_name: "Abebe", membership_name: "Visitor", household_name: null, created_at: "2026-01-01T00:00:00Z" });
  const b = person({ last_name: "Bekele", membership_name: null, household_name: "Zewdu", created_at: "2026-03-01T00:00:00Z" });
  const c = person({ last_name: "Chala", membership_name: "Member", household_name: "Ayele", created_at: "2026-02-01T00:00:00Z" });
  const order = (rows: DirectoryPerson[]) => rows.map((r) => r.last_name);

  it("sorts by name either way", () => {
    expect(order(sortPeople([b, c, a], "name", "asc"))).toEqual(["Abebe", "Bekele", "Chala"]);
    expect(order(sortPeople([b, c, a], "name", "desc"))).toEqual(["Chala", "Bekele", "Abebe"]);
  });

  it("puts blanks last whichever way status or family is sorted", () => {
    expect(order(sortPeople([a, b, c], "status", "asc"))).toEqual(["Chala", "Abebe", "Bekele"]);
    expect(order(sortPeople([a, b, c], "status", "desc"))).toEqual(["Abebe", "Chala", "Bekele"]);
    expect(order(sortPeople([a, b, c], "family", "asc"))).toEqual(["Chala", "Bekele", "Abebe"]);
  });

  it("sorts by when they were added, newest first", () => {
    expect(order(sortPeople([a, b, c], "added", "desc"))).toEqual(["Bekele", "Chala", "Abebe"]);
  });
});

describe("families", () => {
  const withKids = family({ name: "Ayele", child_count: 3, last_check_in: "2026-10-04" });
  const noKids = family({ name: "Bekele", child_count: 0, family_status: "visitor", primary_phone: null });
  const nobody = family({ name: "Chala", adult_count: 0, child_count: 1, family_status: "not_recorded" });
  const all = [noKids, nobody, withKids];
  const names = (rows: DirectoryFamily[]) => rows.map((r) => r.name);

  it("filters by status, children and what is missing", () => {
    expect(names(filterFamilies(all, { ...NO_FAMILY_FILTERS, status: "visitor" }))).toEqual(["Bekele"]);
    expect(names(filterFamilies(all, { ...NO_FAMILY_FILTERS, children: "with" }))).toEqual(["Chala", "Ayele"]);
    expect(names(filterFamilies(all, { ...NO_FAMILY_FILTERS, attention: "no_phone" }))).toEqual(["Bekele"]);
    expect(names(filterFamilies(all, { ...NO_FAMILY_FILTERS, attention: "no_adult" }))).toEqual(["Chala"]);
  });

  it("sorts by status from member down, by children, and by last check-in with blanks last", () => {
    expect(names(sortFamilies(all, "status", "asc"))).toEqual(["Ayele", "Bekele", "Chala"]);
    expect(names(sortFamilies(all, "children", "desc"))).toEqual(["Ayele", "Chala", "Bekele"]);
    expect(names(sortFamilies(all, "last_check_in", "desc"))[0]).toBe("Ayele");
    expect(names(sortFamilies(all, "last_check_in", "asc")).slice(-2).sort()).toEqual(["Bekele", "Chala"]);
  });
});

describe("duplicateIds", () => {
  it("is everyone in every group", () => {
    const a = person({ first_name: "X", last_name: "Y" });
    const b = person({ first_name: "X", last_name: "Y" });
    expect([...duplicateIds(duplicateGroups([a, b]))].sort()).toEqual([a.id, b.id].sort());
  });
});
