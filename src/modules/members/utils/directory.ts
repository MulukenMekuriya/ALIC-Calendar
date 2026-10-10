/**
 * The directory, held in the browser: filtering, sorting, what needs fixing,
 * likely duplicates, and the spreadsheet.
 *
 * church.directory_people returns every person in the branch (1,359 on
 * 10 October) and church.directory_families every family, so the tables can
 * sort by any column, count what is missing and export exactly what is
 * filtered without asking the server again. Pure, so all of it is tested.
 */

import { displayName } from "./normalize";
import { formatAge } from "./age";

/** One row of church.directory_people. */
export interface DirectoryPerson {
  id: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  is_child: boolean;
  is_active: boolean;
  email: string | null;
  phone: string | null;
  gender: string | null;
  birth_year: number | null;
  birth_month: number | null;
  membership_status_id: string | null;
  membership_code: string | null;
  membership_name: string | null;
  household_id: string | null;
  household_name: string | null;
  grade_name: string | null;
  has_login: boolean;
  last_check_in: string | null;
  created_at: string;
  created_by_name: string | null;
}

/** One row of church.directory_families. */
export interface DirectoryFamily {
  household_id: string;
  name: string;
  city: string | null;
  primary_contact_id: string | null;
  primary_contact_name: string | null;
  primary_phone: string | null;
  primary_email: string | null;
  adult_count: number;
  child_count: number;
  family_status: "member" | "regular_attendee" | "visitor" | "not_recorded";
  last_check_in: string | null;
  created_at: string;
}

export const personName = (p: DirectoryPerson) => displayName(p);

/** "(301) 256-4421" for a US number; anything else as it was typed. */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  const local = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (local.length === 10) return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
  return phone.trim();
}

/** A child's grade, else an age where a birth year is known. */
export function ageOrGrade(p: DirectoryPerson): string {
  if (p.is_child && p.grade_name) return p.grade_name;
  const age = formatAge(p);
  return age === "—" ? "" : age;
}

// ------------------------------------------------------------ what needs fixing

export type Attention = "no_status" | "no_email" | "no_phone" | "no_grade" | "duplicate" | "no_family";

export const ATTENTION: { key: Attention; label: string; who: string; why: string }[] = [
  {
    key: "no_status",
    label: "No membership status",
    who: "adults",
    why: "Members, visitors and the Kids Ministry's family filter all read this.",
  },
  {
    key: "duplicate",
    label: "Likely duplicates",
    who: "people",
    why: "The same name more than once. Check-ins and giving split between the two.",
  },
  {
    key: "no_email",
    label: "No email address",
    who: "adults",
    why: "Church and Kids Ministry emails cannot reach them.",
  },
  {
    key: "no_phone",
    label: "No phone number",
    who: "adults",
    why: "The check-in desk finds a family by phone.",
  },
  {
    key: "no_grade",
    label: "Child with no school grade",
    who: "children",
    why: "Check-in places them by age instead, which can be the wrong classroom.",
  },
  {
    key: "no_family",
    label: "In no family",
    who: "people",
    why: "Nobody is linked to them, so a child cannot be collected.",
  },
];

/** Does this person need this fixing? Adults and children are asked different things. */
export function needs(p: DirectoryPerson, attention: Attention, duplicates: ReadonlySet<string>): boolean {
  switch (attention) {
    case "no_status":
      return !p.is_child && !p.membership_status_id;
    case "no_email":
      return !p.is_child && !p.email?.trim();
    case "no_phone":
      return !p.is_child && !p.phone?.trim();
    case "no_grade":
      return p.is_child && !p.grade_name;
    case "duplicate":
      return duplicates.has(p.id);
    case "no_family":
      return !p.household_id;
  }
}

// ------------------------------------------------------------ likely duplicates

/** First and last name, case and spacing ignored. */
export function nameKey(p: { first_name: string; last_name: string }): string {
  const clean = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  return `${clean(p.first_name)}|${clean(p.last_name)}`;
}

export interface DuplicateGroup {
  key: string;
  people: DirectoryPerson[];
}

/**
 * Active people who share a name, two or more to a group, minus any group
 * an admin has said are different people. A dismissal covers a group only
 * when it names everyone in it, so a third person with the same name brings
 * the group back to be looked at.
 */
export function duplicateGroups(
  people: readonly DirectoryPerson[],
  dismissals: readonly (readonly string[])[] = [],
): DuplicateGroup[] {
  const byKey = new Map<string, DirectoryPerson[]>();
  for (const p of people) {
    if (!p.is_active) continue;
    const key = nameKey(p);
    const group = byKey.get(key);
    if (group) group.push(p);
    else byKey.set(key, [p]);
  }
  const dismissed = dismissals.map((ids) => new Set(ids));
  return [...byKey.entries()]
    .filter(([, group]) => group.length > 1)
    .filter(([, group]) => !dismissed.some((set) => group.every((p) => set.has(p.id))))
    .map(([key, group]) => ({
      key,
      people: [...group].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    }))
    .sort((a, b) => personName(a.people[0]).localeCompare(personName(b.people[0])));
}

export const duplicateIds = (groups: readonly DuplicateGroup[]) =>
  new Set(groups.flatMap((g) => g.people.map((p) => p.id)));

// ------------------------------------------------------------ health

export interface Health {
  adults: number;
  children: number;
  counts: Record<Attention, number>;
  duplicateGroups: number;
}

/** What needs fixing, among active people. */
export function health(people: readonly DirectoryPerson[], groups: readonly DuplicateGroup[]): Health {
  const active = people.filter((p) => p.is_active);
  const dupes = duplicateIds(groups);
  const counts = Object.fromEntries(
    ATTENTION.map((a) => [a.key, active.filter((p) => needs(p, a.key, dupes)).length]),
  ) as Record<Attention, number>;
  return {
    adults: active.filter((p) => !p.is_child).length,
    children: active.filter((p) => p.is_child).length,
    counts,
    duplicateGroups: groups.length,
  };
}

// ------------------------------------------------------------ filtering and sorting

export const NO_STATUS = "__none__";

export interface DirectoryFilters {
  search: string;
  /** "all", NO_STATUS, or a membership_status id. */
  status: string;
  type: "all" | "adults" | "children";
  attention: "all" | Attention;
  includeInactive: boolean;
}

export const NO_FILTERS: DirectoryFilters = {
  search: "",
  status: "all",
  type: "all",
  attention: "all",
  includeInactive: false,
};

export function filterPeople(
  people: readonly DirectoryPerson[],
  f: DirectoryFilters,
  duplicates: ReadonlySet<string>,
): DirectoryPerson[] {
  const q = f.search.trim().toLowerCase();
  const digits = q.replace(/\D/g, "");
  // Digits only: a phone search. Anything else: names, family and email.
  const byPhone = digits.length >= 3 && /^[\d\s()+.-]+$/.test(q);
  return people.filter((p) => {
    if (!f.includeInactive && !p.is_active) return false;
    if (f.type === "adults" && p.is_child) return false;
    if (f.type === "children" && !p.is_child) return false;
    if (f.status === NO_STATUS && p.membership_status_id) return false;
    if (f.status !== "all" && f.status !== NO_STATUS && p.membership_status_id !== f.status) return false;
    if (f.attention !== "all" && !needs(p, f.attention, duplicates)) return false;
    if (!q) return true;
    if (byPhone) return (p.phone ?? "").replace(/\D/g, "").includes(digits);
    return [p.first_name, p.last_name, p.preferred_name, p.email, p.household_name]
      .some((v) => v?.toLowerCase().includes(q));
  });
}

export type PeopleSort = "name" | "status" | "family" | "added";
export type SortDir = "asc" | "desc";

/** Blanks last, whichever way the column is sorted. */
function blanksLast(a: string | null | undefined, b: string | null | undefined, dir: SortDir): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return dir === "asc" ? a.localeCompare(b) : b.localeCompare(a);
}

const byName = (a: DirectoryPerson, b: DirectoryPerson) =>
  a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name) || a.id.localeCompare(b.id);

export function sortPeople(rows: readonly DirectoryPerson[], sort: PeopleSort, dir: SortDir): DirectoryPerson[] {
  return [...rows].sort((a, b) => {
    switch (sort) {
      case "name":
        return dir === "asc" ? byName(a, b) : byName(b, a);
      case "status":
        return blanksLast(a.membership_name, b.membership_name, dir) || byName(a, b);
      case "family":
        return blanksLast(a.household_name, b.household_name, dir) || byName(a, b);
      case "added":
        return (dir === "asc" ? a.created_at.localeCompare(b.created_at) : b.created_at.localeCompare(a.created_at)) || byName(a, b);
    }
  });
}

// ------------------------------------------------------------ families

export interface FamilyFilters {
  search: string;
  status: "all" | DirectoryFamily["family_status"];
  children: "all" | "with" | "without";
  attention: "all" | "no_phone" | "no_email" | "no_adult";
}

export const NO_FAMILY_FILTERS: FamilyFilters = {
  search: "",
  status: "all",
  children: "all",
  attention: "all",
};

export function filterFamilies(families: readonly DirectoryFamily[], f: FamilyFilters): DirectoryFamily[] {
  const q = f.search.trim().toLowerCase();
  const digits = q.replace(/\D/g, "");
  const byPhone = digits.length >= 3 && /^[\d\s()+.-]+$/.test(q);
  return families.filter((h) => {
    if (f.status !== "all" && h.family_status !== f.status) return false;
    if (f.children === "with" && h.child_count === 0) return false;
    if (f.children === "without" && h.child_count > 0) return false;
    if (f.attention === "no_phone" && h.primary_phone?.trim()) return false;
    if (f.attention === "no_email" && h.primary_email?.trim()) return false;
    if (f.attention === "no_adult" && h.adult_count > 0) return false;
    if (!q) return true;
    if (byPhone) return (h.primary_phone ?? "").replace(/\D/g, "").includes(digits);
    return [h.name, h.primary_contact_name, h.city, h.primary_email].some((v) => v?.toLowerCase().includes(q));
  });
}

export type FamilySort = "name" | "status" | "children" | "last_check_in" | "added";

const FAMILY_RANK: Record<DirectoryFamily["family_status"], number> = {
  member: 0,
  regular_attendee: 1,
  visitor: 2,
  not_recorded: 3,
};

export function sortFamilies(rows: readonly DirectoryFamily[], sort: FamilySort, dir: SortDir): DirectoryFamily[] {
  const name = (a: DirectoryFamily, b: DirectoryFamily) =>
    a.name.localeCompare(b.name) || a.household_id.localeCompare(b.household_id);
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    switch (sort) {
      case "name":
        return sign * name(a, b);
      case "status":
        return sign * (FAMILY_RANK[a.family_status] - FAMILY_RANK[b.family_status]) || name(a, b);
      case "children":
        return sign * (a.child_count - b.child_count) || name(a, b);
      case "last_check_in":
        return blanksLast(a.last_check_in, b.last_check_in, dir) || name(a, b);
      case "added":
        return sign * a.created_at.localeCompare(b.created_at) || name(a, b);
    }
  });
}
