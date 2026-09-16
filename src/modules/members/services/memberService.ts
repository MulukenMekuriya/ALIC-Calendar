/**
 * Member (people) data access.
 *
 * Follows the budget module's service convention: a plain object of async
 * methods, `throw error` on failure, `updated_at` stamped on update, and
 * PGRST116 ("no rows") tolerated on single-row lookups.
 */

import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type {
  Member,
  MemberInsert,
  MemberUpdate,
  MemberWithRelations,
  MemberFilters,
  MemberStats,
  ProfileBackfillRow,
} from "../types";
import { MEMBER_PAGE_SIZE } from "../types";
import { normalizePhone } from "../utils/normalize";

const church = () => supabase.schema("church");

/** PostgREST code for "no rows returned by .single()". */
const NO_ROWS = "PGRST116";

export interface ListMembersResult {
  rows: Member[];
  total: number;
}

export const memberService = {
  /**
   * Directory listing.
   *
   * Always paginated: supabase/config.toml sets max_rows = 1000, and PostgREST
   * truncates silently past it — an unpaginated list would quietly stop being
   * the whole directory as the church grows.
   */
  async list(
    organizationId: string,
    filters: MemberFilters = {},
    page = 0,
    pageSize = MEMBER_PAGE_SIZE
  ): Promise<ListMembersResult> {
    let query = church()
      .from("people")
      .select("*", { count: "exact" })
      .eq("organization_id", organizationId)
      .is("merged_into_person_id", null);

    if (!filters.include_inactive) query = query.eq("is_active", true);
    if (filters.membership_status_id) {
      query = query.eq("membership_status_id", filters.membership_status_id);
    }
    if (filters.is_child !== undefined) query = query.eq("is_child", filters.is_child);
    if (filters.birth_month) query = query.eq("birth_month", filters.birth_month);
    if (filters.has_email) query = query.not("email", "is", null);
    if (filters.has_phone) query = query.not("phone", "is", null);

    if (filters.search?.trim()) {
      const term = filters.search.trim();
      const digits = normalizePhone(term);
      // Digits-only input is a phone lookup; anything else is a name lookup.
      // Both are backed by trigram indexes on the generated columns.
      if (digits.length >= 3 && digits.length === term.replace(/\D/g, "").length && /^\d+$/.test(term.replace(/\D/g, "")) && /\d/.test(term)) {
        query = query.like("phone_digits", `%${digits}`);
      } else {
        query = query.or(
          `search_name.ilike.%${term.toLowerCase()}%,email.ilike.%${term}%`
        );
      }
    }

    const from = page * pageSize;
    query = query.order("last_name").order("first_name").range(from, from + pageSize - 1);

    const { data, error, count } = await query;
    if (error) throw error;
    return { rows: data || [], total: count ?? 0 };
  },

  async get(memberId: string): Promise<Member | null> {
    const { data, error } = await church()
      .from("people")
      .select("*")
      .eq("id", memberId)
      .single();
    if (error && error.code !== NO_ROWS) throw error;
    return data;
  },

  /**
   * Full profile for MEM-006: ministries, groups, service interests and family
   * in one round trip.
   *
   * Note the embeds are within the `church` schema — PostgREST cannot embed
   * across schemas, which is why ministry NAME is resolved separately by the
   * caller rather than joined from budget.ministries here.
   */
  async getWithRelations(memberId: string): Promise<MemberWithRelations | null> {
    const { data, error } = await church()
      .from("people")
      // Foreign-key hints are REQUIRED here and the names are the actual
      // constraint names, not PostgREST's default <table>_<col>_fkey pattern.
      // person_relationships and person_service_interests each have TWO
      // foreign keys to people (the person, and the related person / follow-up
      // owner), so without a hint PostgREST returns 300 PGRST201 "ambiguous
      // embedding" rather than picking one. Verified against production.
      .select(
        `*,
         membership_status:membership_statuses(id, code, display_name),
         relationships:person_relationships!fk_person_relationships_person(
           *,
           related_person:people!fk_person_relationships_related(
             id, first_name, last_name, is_child
           ),
           relationship_type:relationship_types(code, display_name)
         ),
         ministry_assignments(
           *, role:ministry_roles(code, display_name, is_leadership_role)
         ),
         service_interests:person_service_interests!fk_service_interests_person(*),
         group_memberships(
           *, group:groups(id, name, meeting_day),
           role:ministry_roles(code, display_name, is_leadership_role)
         )`
      )
      .eq("id", memberId)
      .single();

    if (error && error.code !== NO_ROWS) throw error;
    return data as unknown as MemberWithRelations | null;
  },

  /**
   * Amend a member record through church.update_person_details.
   *
   * Not a table update: the RPC is what enforces which fields the caller may
   * set (a member may not archive themselves, flip the is_child flag that
   * decides who may collect a child, or rewrite their member number) and what
   * gets written to church.people_history.
   */
  async updateDetails(
    personId: string,
    patch: Record<string, unknown>
  ): Promise<Member> {
    const { data, error } = await church().rpc("update_person_details", {
      _person_id: personId,
      // The RPC takes jsonb; the caller builds a plain object of changed
      // fields. Json's recursive type will not accept Record<string, unknown>
      // structurally, and widening the caller to Json would push that noise
      // into every form.
      _patch: patch as Json,
    });
    if (error) throw error;
    return data as unknown as Member;
  },

  async listByHousehold(householdId: string): Promise<Member[]> {
    const { data, error } = await church()
      .from("household_members")
      .select("household_role, is_primary_contact, person:people(*)")
      .eq("household_id", householdId)
      .is("end_date", null);
    if (error) throw error;
    return ((data || []) as unknown as { person: Member }[])
      .map((row) => row.person)
      .filter(Boolean);
  },

  async create(member: MemberInsert): Promise<Member> {
    const { data, error } = await church()
      .from("people")
      .insert(member)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(memberId: string, patch: MemberUpdate): Promise<Member> {
    const { data, error } = await church()
      .from("people")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", memberId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  /**
   * Deactivate rather than delete (SEC-004 / MEM-007): historical
   * participation must survive a member leaving.
   */
  async deactivate(memberId: string, reason: string): Promise<Member> {
    return memberService.update(memberId, {
      is_active: false,
      inactive_reason: reason,
    });
  },

  async reactivate(memberId: string): Promise<Member> {
    return memberService.update(memberId, { is_active: true, inactive_reason: null });
  },

  /** Directory KPI tiles. Counts only, no rows fetched. */
  async getStats(organizationId: string): Promise<MemberStats> {
    const base = () =>
      church()
        .from("people")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .is("merged_into_person_id", null);

    const [total, active, children, households, serving] = await Promise.all([
      base(),
      base().eq("is_active", true),
      base().eq("is_active", true).eq("is_child", true),
      church()
        .from("households")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("is_active", true),
      church()
        .from("ministry_assignments")
        .select("person_id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .is("end_date", null),
    ]);

    for (const r of [total, active, children, households, serving]) {
      if (r.error) throw r.error;
    }

    const activeCount = active.count ?? 0;
    const childCount = children.count ?? 0;

    return {
      total: total.count ?? 0,
      active: activeCount,
      children: childCount,
      adults: activeCount - childCount,
      households: households.count ?? 0,
      // NOTE: this is an assignment-row count, not distinct people. The
      // distinct figure (spec 9.3 / MIN-007) comes from servingService, which
      // does the COUNT(DISTINCT person_id) the spec requires.
      serving: serving.count ?? 0,
    };
  },

  /**
   * What backfilling members from existing logins would do, before it does it.
   *
   * The church has logins for people who have no member record at all, which
   * is why the directory can be empty while 62 people can sign in. Linking
   * them also switches on everything keyed to church.people.profile_id: a
   * member seeing their own record, "My household", and the volunteer
   * eligibility check at the check-in desk.
   */
  async previewProfileBackfill(organizationId: string): Promise<ProfileBackfillRow[]> {
    const { data, error } = await church().rpc("preview_profile_backfill", {
      _organization_id: organizationId,
    });
    if (error) throw error;
    return (data ?? []) as unknown as ProfileBackfillRow[];
  },

  /** Idempotent: re-running links what is new and skips what is done. */
  async runProfileBackfill(
    organizationId: string
  ): Promise<{ created: number; linked: number; skipped: number }> {
    const { data, error } = await church().rpc("backfill_people_from_profiles", {
      _organization_id: organizationId,
    });
    if (error) throw error;
    const rows = (data ?? []) as unknown as {
      created: number;
      linked: number;
      skipped: number;
    }[];
    return rows[0] ?? { created: 0, linked: 0, skipped: 0 };
  },

  /** Logins in this branch with no member record yet. */
  async unlinkedLogins(
    organizationId: string
  ): Promise<{ profile_id: string; full_name: string; email: string | null }[]> {
    const { data, error } = await church().rpc("unlinked_logins", {
      _organization_id: organizationId,
    });
    if (error) throw error;
    return (data ?? []) as unknown as {
      profile_id: string;
      full_name: string;
      email: string | null;
    }[];
  },

  /** Attach a login to a member by hand, for anyone the email match missed. */
  async linkProfile(personId: string, profileId: string | null): Promise<void> {
    const { error } = await church().rpc("link_profile_to_person", {
      _person_id: personId,
      _profile_id: profileId,
    });
    if (error) throw error;
  },

  /** Birthday list. Month granularity only — no day is stored. */
  async listBirthdaysInMonth(organizationId: string, month: number): Promise<Member[]> {
    const { data, error } = await church()
      .from("people")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .eq("birth_month", month)
      .is("merged_into_person_id", null)
      .order("last_name");
    if (error) throw error;
    return data || [];
  },
};
