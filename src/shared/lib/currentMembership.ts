/**
 * Which branch a login opens on.
 *
 * The profile's default branch wins, unless the login is only a 'member'
 * there while holding a real role in another branch. public.handle_new_user
 * gives every new login a VA 'member' row and a VA default, wherever they were
 * really made, so a Board login made for MD opened on VA. A member is shown
 * nothing by the staff-only policies: no fiscal years, no requests.
 *
 * Then a branch where they have a role beats one where they are a member, and
 * within those the primary one, then the first. A login that is only ever a
 * member keeps today's behaviour: default, then primary, then first.
 */

interface Membership {
  organization_id: string;
  role: string;
  is_primary?: boolean | null;
}

const isStaffRole = (role: string) => role !== "member";

export function pickCurrentMembership<T extends Membership>(
  memberships: T[],
  defaultOrganizationId?: string | null,
): T | null {
  if (memberships.length === 0) return null;

  const staff = memberships.filter((m) => isStaffRole(m.role));
  const preferred = defaultOrganizationId
    ? memberships.find((m) => m.organization_id === defaultOrganizationId)
    : undefined;

  if (preferred && (isStaffRole(preferred.role) || staff.length === 0)) {
    return preferred;
  }

  const pool = staff.length > 0 ? staff : memberships;
  return pool.find((m) => m.is_primary) ?? pool[0];
}
