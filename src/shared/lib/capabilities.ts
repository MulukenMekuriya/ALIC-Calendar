/**
 * Capability resolution for the Members and Kids Ministry modules.
 *
 * WHY THIS EXISTS
 * ---------------
 * `public.user_organizations` has UNIQUE(user_id, organization_id), so a user
 * holds exactly ONE `app_role` per branch. Adding kids roles to that enum
 * would take away someone's `treasury` or `contributor`. Module permissions
 * are therefore additive rows in `church.module_grants`, resolved here into a
 * flat capability set the UI can gate on.
 *
 * THIS IS NOT THE SECURITY BOUNDARY.
 * Hiding a button is not authorization. Every capability below has a matching
 * RLS policy or SECURITY DEFINER RPC check in the database, and that is what
 * actually enforces access. This module exists so the UI does not offer
 * actions that will fail, and so route gating is testable.
 *
 * Everything here is pure — no React, no Supabase — so it runs in the node
 * test environment.
 */

/** Additive per-organization module roles (mirrors `church.module_permission`). */
export const MINISTRY_ROLES = [
  "members_admin",
  "members_viewer",
  "members_import",
  "kids_admin",
  "kids_leader",
  "kids_volunteer",
  "leadership_viewer",
  "giving_admin",
  "giving_viewer",
] as const;

export type MinistryRole = (typeof MINISTRY_ROLES)[number];

export const CAPABILITIES = [
  "members.read",
  "members.write",
  "members.import",
  "kids.read",
  "kids.write",
  "kids.checkin",
  "kids.override",
  "giving.read",
  "giving.write",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/** One additive grant, always scoped to a single organization. */
export interface ModuleGrant {
  organization_id: string;
  role: MinistryRole;
}

/**
 * What each role grants, before the admin override.
 *
 * `kids_volunteer` deliberately does NOT get `kids.read`: a volunteer holding
 * the station tablet can check children in and out, but cannot browse the
 * member directory or the kids admin screens. `kids.override` is likewise
 * withheld — authorizing a checkout override is a `kids_admin` act, which is
 * what makes the two-person rule meaningful.
 */
const ROLE_CAPABILITIES: Record<MinistryRole, readonly Capability[]> = {
  members_admin: ["members.read", "members.write"],
  members_viewer: ["members.read"],
  members_import: ["members.read", "members.import"],
  /**
   * The Kids Ministry leader: classrooms, teachers, reports and the pickup
   * override.
   *
   * Deliberately does NOT carry members.read. The kids module reads no
   * directory table at all — every child, parent and pickup candidate it shows
   * arrives through a SECURITY DEFINER RPC (station_search_households,
   * station_child_safety_card, kids_live_board and thirty-five others), and
   * those log what was looked at. Bundling the directory in here handed a kids
   * leader all 1,050 people through an unaudited table read, which is the
   * arrangement the kids_volunteer note above already rejects, and the one
   * the giving pair were built to avoid.
   *
   * Someone who genuinely needs both holds both grants — they are additive.
   */
  kids_admin: ["kids.read", "kids.write", "kids.checkin", "kids.override"],
  /**
   * A team lead: runs their own grades and nothing else.
   *
   * Everything kids_admin has EXCEPT kids.override. The database enforces the
   * same split — resolve_actor derives can_override from kids_admin alone — and
   * church.kids_leader_scope narrows which classrooms they see. This map only
   * decides what the UI offers; it is not the control.
   *
   * Withholding override is the point of the role. The plan calls the
   * two-person rule "the single most important control in the system", and an
   * override that four of the six leaders can self-authorise is not one.
   */
  kids_leader: ["kids.read", "kids.write", "kids.checkin"],
  kids_volunteer: ["kids.checkin"],
  leadership_viewer: ["members.read", "kids.read"],
  /**
   * The giving pair.
   *
   * Neither carries members.read. A treasurer recording a cheque does not need
   * the directory, and the giving screens are built so they never ask for it:
   * every donor name they show arrives through a SECURITY DEFINER function
   * (church.giving_donations, church.giving_person_search) that returns a name
   * and nothing else.
   *
   * leadership_viewer deliberately does NOT pick up giving.read either.
   * Reading the directory is not reading the ledger, and what a household
   * gives is the most sensitive non-medical fact this system stores.
   */
  giving_admin: ["giving.read", "giving.write"],
  giving_viewer: ["giving.read"],
};

export interface ResolveCapabilitiesInput {
  /**
   * Whether the user is an admin **of the organization being resolved**.
   *
   * Note: `useAuth().isAdmin` is currently computed across ALL of the user's
   * organizations without filtering, so it is not safe to pass directly.
   * Use the org-scoped value.
   */
  isOrgAdmin: boolean;
  /** All of the user's grants, across every organization. */
  grants: ModuleGrant[];
  /** The organization currently in context. Grants for other orgs are ignored. */
  organizationId: string | null | undefined;
}

/**
 * Resolve the capability set for one organization.
 *
 * Grants belonging to other organizations are discarded, so a kids_admin at
 * Silver Spring gets nothing at Springfield.
 */
export function resolveCapabilities({
  isOrgAdmin,
  grants,
  organizationId,
}: ResolveCapabilitiesInput): Set<Capability> {
  // With no organization in context there is nothing to authorize against.
  if (!organizationId) return new Set();

  // Product decision: an org admin implies every module capability, including
  // access to children's sensitive data. Access is still written to
  // church.check_in_audit, so it remains traceable after the fact.
  if (isOrgAdmin) return new Set(CAPABILITIES);

  const resolved = new Set<Capability>();
  for (const grant of grants) {
    if (grant.organization_id !== organizationId) continue;
    const caps = ROLE_CAPABILITIES[grant.role];
    // Ignore unknown roles rather than throwing — a role added to the database
    // ahead of a frontend deploy must not blank the UI.
    if (!caps) continue;
    for (const cap of caps) resolved.add(cap);
  }
  return resolved;
}

/** Does this capability set include `capability`? */
export function can(capabilities: Set<Capability>, capability: Capability): boolean {
  return capabilities.has(capability);
}

/** Does this capability set include at least one of `required`? */
export function canAny(
  capabilities: Set<Capability>,
  required: readonly Capability[]
): boolean {
  // An empty requirement means "no capability needed", not "denied".
  if (required.length === 0) return true;
  return required.some((capability) => capabilities.has(capability));
}

/** Does this capability set include every one of `required`? */
export function canAll(
  capabilities: Set<Capability>,
  required: readonly Capability[]
): boolean {
  return required.every((capability) => capabilities.has(capability));
}
