/**
 * Finding one person in a roster that is mostly congregation.
 *
 * 589 of the 625 logins in MD hold 'member' — the whole Breeze import, a login
 * and nothing else. User Management exists to give somebody a job, so a list
 * that opens on all 625 buries the 36 people who have one. These two controls,
 * a tier filter and a search, are what the screen opens with instead.
 */

/** Sentinels for the role filter. Neither is a public.app_role value. */
export const STAFF_ONLY = "__staff__";
export const EVERYONE = "__all__";

/** A tier that comes with a job. 'member' is the floor and carries none. */
export const holdsAJob = (role?: string | null) => !!role && role !== "member";

export interface RosterRow {
  full_name?: string | null;
  email?: string | null;
  ministry_name?: string | null;
  user_roles?: Array<{ role: string }> | null;
}

/**
 * Narrow the roster by tier, then by text.
 *
 * Search runs inside whatever the tier filter left, so "the member called
 * Tigist" is two controls rather than a scroll: set Everyone, type the name.
 */
export const filterRoster = <T extends RosterRow>(
  users: T[] | undefined,
  roleFilter: string,
  search: string,
): T[] => {
  const query = search.trim().toLowerCase();

  return (users || []).filter((user) => {
    const role = user.user_roles?.[0]?.role;

    if (roleFilter === STAFF_ONLY && !holdsAJob(role)) return false;
    if (roleFilter !== STAFF_ONLY && roleFilter !== EVERYONE && role !== roleFilter) {
      return false;
    }

    if (!query) return true;

    return [user.full_name, user.email, user.ministry_name].some((field) =>
      (field || "").toLowerCase().includes(query),
    );
  });
};

/**
 * Most responsibility first. Board is listed for when the tier ships; an
 * unknown tier sorts after the known ones and before 'member'.
 */
const ROLE_ORDER = ["admin", "board", "treasury", "finance", "contributor"];

const rank = (role?: string | null) => {
  if (!holdsAJob(role)) return ROLE_ORDER.length + 1;
  const i = ROLE_ORDER.indexOf(role as string);
  return i === -1 ? ROLE_ORDER.length : i;
};

/** Staff by tier, then by name; members last. Does not mutate. */
export const rankByRole = <T extends RosterRow>(users: T[]): T[] =>
  [...users].sort(
    (a, b) =>
      rank(a.user_roles?.[0]?.role) - rank(b.user_roles?.[0]?.role) ||
      (a.full_name || a.email || "").localeCompare(b.full_name || b.email || ""),
  );
