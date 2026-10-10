/**
 * The directory for the people who keep it: everyone, every family, one
 * status for many, and "these are different people".
 *
 * PostgREST hands back at most 1,000 rows a call, so the two lists are read
 * in slices until a short one comes back. The functions order by name and
 * then id, so the slices never overlap or skip.
 */

import { supabase } from "@/integrations/supabase/client";
import type { DirectoryFamily, DirectoryPerson } from "../utils/directory";

const church = () => supabase.schema("church");
const SLICE = 1000;

async function everyRow<T>(
  read: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += SLICE) {
    const { data, error } = await read(from, from + SLICE - 1);
    if (error) throw new Error(error.message);
    const slice = (data ?? []) as T[];
    rows.push(...slice);
    if (slice.length < SLICE) return rows;
  }
}

export const directoryService = {
  people(organizationId: string): Promise<DirectoryPerson[]> {
    return everyRow<DirectoryPerson>((from, to) =>
      church().rpc("directory_people", { _organization_id: organizationId }).range(from, to),
    );
  },

  families(organizationId: string): Promise<DirectoryFamily[]> {
    return everyRow<DirectoryFamily>((from, to) =>
      church().rpc("directory_families", { _organization_id: organizationId }).range(from, to),
    );
  },

  /** Returns how many people actually changed. */
  async setMembershipStatus(
    organizationId: string,
    personIds: string[],
    membershipStatusId: string,
  ): Promise<number> {
    const { data, error } = await church().rpc("set_membership_status", {
      _organization_id: organizationId,
      _person_ids: personIds,
      _membership_status_id: membershipStatusId,
    });
    if (error) throw new Error(error.message);
    return (data as number | null) ?? 0;
  },

  async dismissals(organizationId: string): Promise<string[][]> {
    const { data, error } = await church().rpc("duplicate_dismissals", {
      _organization_id: organizationId,
    });
    if (error) throw new Error(error.message);
    return ((data ?? []) as { person_ids: string[] }[]).map((d) => d.person_ids);
  },

  async dismissDuplicates(organizationId: string, personIds: string[]): Promise<void> {
    const { error } = await church().rpc("dismiss_duplicate_group", {
      _organization_id: organizationId,
      _person_ids: personIds,
    });
    if (error) throw new Error(error.message);
  },
};
