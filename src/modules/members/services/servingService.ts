/**
 * Ministry service assignments and service interests.
 *
 * The counting rules here are the point of the whole module. Spec 9.3 requires
 * three DIFFERENT measures that are routinely conflated:
 *
 *   Ministry assignment count  -> COUNT(assignment rows)
 *   Unique serving members     -> COUNT(DISTINCT person_id)
 *   Ministry size              -> COUNT(DISTINCT person_id) within one ministry
 *
 * A person serving in Worship and Prayer is TWO assignments and ONE minister.
 * Every function below states which it returns.
 */

import { supabase } from "@/integrations/supabase/client";
import { referenceService } from "./referenceService";
import type {
  MinistryAssignment,
  MinistryAssignmentInsert,
  MinistryAssignmentWithMinistry,
  ServiceInterest,
  ServiceInterestInsert,
} from "../types";

const church = () => supabase.schema("church");
const budget = () => supabase.schema("budget");

/**
 * Postgres exclusion_violation. PostgREST returns it as a 400 rather than the
 * 409 it gives a unique violation, so the code is the only reliable signal.
 */
const EXCLUSION_VIOLATION = "23P01";

export interface MinistrySummary {
  ministry_id: string;
  ministry_name: string;
  /** DISTINCT people, not assignment rows (MIN-007). */
  member_count: number;
  leader_count: number;
}

export interface ServingTotals {
  /** COUNT(DISTINCT person_id) — the church-wide "how many ministers" figure. */
  unique_serving_members: number;
  /** COUNT(rows) — always >= unique_serving_members. */
  assignment_count: number;
  /** People with more than one active assignment. */
  members_in_multiple_ministries: number;
}

export const servingService = {
  async listByMember(memberId: string): Promise<MinistryAssignmentWithMinistry[]> {
    const { data, error } = await church()
      .from("ministry_assignments")
      .select("*, role:ministry_roles(code, display_name, is_leadership_role)")
      .eq("person_id", memberId)
      .is("end_date", null);
    if (error) throw error;

    // budget.ministries lives in another schema, and PostgREST cannot embed
    // across schemas, so the ministry name is resolved in a second query.
    return servingService.attachMinistryNames(
      (data || []) as unknown as MinistryAssignmentWithMinistry[]
    );
  },

  async listByMinistry(ministryId: string): Promise<MinistryAssignmentWithMinistry[]> {
    const { data, error } = await church()
      .from("ministry_assignments")
      .select(
        `*, role:ministry_roles(code, display_name, is_leadership_role),
         member:people(id, first_name, last_name)`
      )
      .eq("ministry_id", ministryId)
      .is("end_date", null);
    if (error) throw error;
    return servingService.attachMinistryNames(
      (data || []) as unknown as MinistryAssignmentWithMinistry[]
    );
  },

  /**
   * Resolve ministry names for a set of assignments.
   *
   * The name shown is the church's own (church.ministry_aliases, via
   * referenceService.churchMinistryNames), which is what the pickers offer —
   * a row that reads "Alic MD Prayer" under a dropdown offering "MD Prayer"
   * is the same ministry twice. The budget row's name is the fallback for a
   * ministry the church has no recorded spelling for.
   */
  async attachMinistryNames(
    assignments: MinistryAssignmentWithMinistry[]
  ): Promise<MinistryAssignmentWithMinistry[]> {
    if (assignments.length === 0) return assignments;
    const ids = [...new Set(assignments.map((a) => a.ministry_id))];
    const [rows, churchNames] = await Promise.all([
      budget()
        .from("ministries")
        .select("id, name")
        .in("id", ids)
        .then(({ data, error }) => {
          if (error) throw error;
          return data || [];
        }),
      referenceService.churchMinistryNames({ ministryIds: ids }),
    ]);
    const byId = new Map(rows.map((m) => [m.id, m.name]));
    return assignments.map((a) => ({
      ...a,
      ministry: {
        id: a.ministry_id,
        name:
          churchNames.get(a.ministry_id) ??
          byId.get(a.ministry_id) ??
          "Unknown ministry",
      },
    }));
  },

  /**
   * Church-wide serving totals, computed the way spec 9.3 requires.
   *
   * Fetches the active person/ministry pairs and reduces locally rather than
   * relying on a count header, because "distinct people" and "distinct people
   * with 2+ ministries" cannot both come from one PostgREST count.
   */
  async getTotals(organizationId: string): Promise<ServingTotals> {
    const { data, error } = await church()
      .from("ministry_assignments")
      .select("person_id, ministry_id")
      .eq("organization_id", organizationId)
      .is("end_date", null);
    if (error) throw error;

    const rows = data || [];
    const ministriesPerPerson = new Map<string, Set<string>>();
    for (const row of rows) {
      if (!ministriesPerPerson.has(row.person_id)) {
        ministriesPerPerson.set(row.person_id, new Set());
      }
      ministriesPerPerson.get(row.person_id)!.add(row.ministry_id);
    }

    let multi = 0;
    for (const set of ministriesPerPerson.values()) {
      if (set.size > 1) multi += 1;
    }

    return {
      unique_serving_members: ministriesPerPerson.size,
      assignment_count: rows.length,
      members_in_multiple_ministries: multi,
    };
  },

  /** Per-ministry roster sizes, counting DISTINCT people (MIN-007). */
  async getMinistrySummaries(organizationId: string): Promise<MinistrySummary[]> {
    const [assignments, ministries, roles] = await Promise.all([
      church()
        .from("ministry_assignments")
        .select("person_id, ministry_id, ministry_role_id")
        .eq("organization_id", organizationId)
        .is("end_date", null),
      budget()
        .from("ministries")
        .select("id, name")
        .eq("organization_id", organizationId)
        .eq("is_active", true),
      church()
        .from("ministry_roles")
        .select("id, is_leadership_role")
        .eq("organization_id", organizationId),
    ]);

    if (assignments.error) throw assignments.error;
    if (ministries.error) throw ministries.error;
    if (roles.error) throw roles.error;

    const leadershipRoleIds = new Set(
      (roles.data || []).filter((r) => r.is_leadership_role).map((r) => r.id)
    );

    const people = new Map<string, Set<string>>();
    const leaders = new Map<string, Set<string>>();
    for (const a of assignments.data || []) {
      if (!people.has(a.ministry_id)) people.set(a.ministry_id, new Set());
      people.get(a.ministry_id)!.add(a.person_id);
      if (leadershipRoleIds.has(a.ministry_role_id)) {
        if (!leaders.has(a.ministry_id)) leaders.set(a.ministry_id, new Set());
        leaders.get(a.ministry_id)!.add(a.person_id);
      }
    }

    return (ministries.data || [])
      .map((m) => ({
        ministry_id: m.id,
        ministry_name: m.name,
        member_count: people.get(m.id)?.size ?? 0,
        leader_count: leaders.get(m.id)?.size ?? 0,
      }))
      .sort((a, b) => a.ministry_name.localeCompare(b.ministry_name));
  },

  /**
   * Put somebody into a ministry — or back into one they left today.
   *
   * The EXCLUDE constraint (BR-08) forbids two assignments of the same person,
   * ministry and role over overlapping dates, and its range is INCLUSIVE of
   * end_date: a row ended on 11 Sep still occupies 11 Sep. So "Remove" followed
   * by "Add" on the same day — the correction anyone makes after an accidental
   * click — was rejected outright, as a 23P01 that PostgREST returns as a bare
   * 400 and the form reported as "they already hold that role".
   *
   * They do not hold it; they held it until an hour ago. Re-adding within the
   * old span is therefore taken as undoing the removal: the original row is
   * reopened, keeping the start date it has always had, rather than a second
   * row being stacked on top of it with today's date. A ministry someone left
   * LAST year does not overlap, never hits this path, and gets a new row with
   * a new start date, which is the honest record of a genuine return.
   *
   * A conflict with an assignment that is still open is left to fail: that one
   * really is a duplicate, and the message the form shows is correct.
   */
  async create(assignment: MinistryAssignmentInsert): Promise<MinistryAssignment> {
    const { data, error } = await church()
      .from("ministry_assignments")
      .insert(assignment)
      .select()
      .single();
    if (!error) return data;
    if (error.code !== EXCLUSION_VIOLATION) throw error;

    const { data: existing, error: lookupError } = await church()
      .from("ministry_assignments")
      .select("id, end_date")
      .eq("person_id", assignment.person_id)
      .eq("ministry_id", assignment.ministry_id)
      .eq("ministry_role_id", assignment.ministry_role_id)
      .order("end_date", { ascending: false });
    if (lookupError) throw error;

    const ended = (existing || []).filter((a) => a.end_date !== null);
    if (ended.length === 0 || (existing || []).some((a) => a.end_date === null)) {
      throw error;
    }

    const { data: reopened, error: reopenError } = await church()
      .from("ministry_assignments")
      .update({ end_date: null, updated_at: new Date().toISOString() })
      .eq("id", ended[0].id)
      .select()
      .single();
    if (reopenError) throw reopenError;
    return reopened;
  },

  /** End an assignment rather than deleting it, preserving history (MIN-008). */
  async end(assignmentId: string, endedOn?: string): Promise<void> {
    const { error } = await church()
      .from("ministry_assignments")
      .update({
        end_date: endedOn ?? new Date().toISOString().slice(0, 10),
        updated_at: new Date().toISOString(),
      })
      .eq("id", assignmentId);
    if (error) throw error;
  },
};

export const serviceInterestService = {
  async listByMember(memberId: string): Promise<ServiceInterest[]> {
    const { data, error } = await church()
      .from("person_service_interests")
      .select("*")
      .eq("person_id", memberId);
    if (error) throw error;
    return data || [];
  },

  /**
   * SRV-003: people who expressed interest in a ministry but are not actually
   * serving in it yet. This is the report that turns interest into placement.
   */
  async listUnplaced(organizationId: string): Promise<ServiceInterest[]> {
    const [interests, assignments] = await Promise.all([
      church()
        .from("person_service_interests")
        .select("*")
        .eq("organization_id", organizationId)
        .in("status", ["interested", "contacted"]),
      church()
        .from("ministry_assignments")
        .select("person_id, ministry_id")
        .eq("organization_id", organizationId)
        .is("end_date", null),
    ]);
    if (interests.error) throw interests.error;
    if (assignments.error) throw assignments.error;

    const serving = new Set(
      (assignments.data || []).map((a) => `${a.person_id}:${a.ministry_id}`)
    );
    return (interests.data || []).filter(
      (i) => !serving.has(`${i.person_id}:${i.ministry_id}`)
    );
  },

  async create(interest: ServiceInterestInsert): Promise<ServiceInterest> {
    const { data, error } = await church()
      .from("person_service_interests")
      .insert(interest)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateStatus(interestId: string, status: string): Promise<void> {
    const { error } = await church()
      .from("person_service_interests")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", interestId);
    if (error) throw error;
  },
};
