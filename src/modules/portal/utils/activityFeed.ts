/**
 * What the church has actually recorded about you, lately.
 *
 * A member's standing question about a church database is not "how much have I
 * given" — the tile says that — it is "did it go in". Did the cash I put in
 * the envelope on Sunday reach the ledger. Did somebody write down that my
 * daughter was collected, and by whom. Enterprise systems answer that with an
 * activity log, and there is no reason a member should be the one person in
 * the building who cannot see theirs.
 *
 * NO NEW QUERY, AND THAT IS THE DESIGN
 * ------------------------------------
 * Every row here is merged from data the portal has already fetched for its
 * other tabs — church.my_giving, church.my_children_check_ins,
 * church.my_serving. Nothing in this feed is visible here that is not already
 * visible one tab away, so it widens no disclosure; it only puts three
 * separate histories in one order. If that ever stops being true, it has
 * become a different feature and needs thinking about again.
 *
 * WHAT IS EXCLUDED, AND WHY IT MATTERS
 * ------------------------------------
 * A check-in that has not finished. church.my_children_check_ins is
 * deliberately a history and not a tracker — the reasoning is in the header of
 * 20260322000600: where a child is sitting right now is a question answered to
 * a person standing at the desk, never to a login that can be phished. An open
 * check-in with a room name against it is exactly that live location, so only
 * rows that have been collected or checked out reach this feed.
 *
 * Group memberships are also absent, for a duller reason: church.my_groups
 * returns no start date, so there is no instant to file them under. Better
 * missing than filed under today.
 */

import { formatMoney, METHOD_LABELS } from "@/modules/giving/utils/money";

export type ActivityKind = "gift" | "child" | "serving";

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  /** The day it happened, for ordering and for the relative label. */
  on: string;
  title: string;
  detail: string;
}

export interface ActivityInputs {
  gifts: {
    id: string;
    received_on: string;
    amount_cents: number;
    fund_name: string;
    method: string;
  }[];
  checkIns: {
    check_in_id: string;
    child_name: string;
    session_date: string;
    service_label: string;
    picked_up_by_name: string | null;
    checked_out_at: string | null;
  }[];
  serving: {
    assignment_id: string;
    ministry_name: string;
    role_name: string;
    start_date: string;
  }[];
  limit?: number;
}

export function buildActivityFeed(input: ActivityInputs): ActivityItem[] {
  const items: ActivityItem[] = [];

  for (const gift of input.gifts) {
    items.push({
      id: `gift-${gift.id}`,
      kind: "gift",
      on: gift.received_on,
      title: `${formatMoney(gift.amount_cents)} recorded`,
      detail: `${gift.fund_name} · ${METHOD_LABELS[gift.method] ?? gift.method}`,
    });
  }

  for (const row of input.checkIns) {
    // Finished Sundays only — see the header. An open check-in is live
    // information about where a child is, and does not belong behind a login.
    if (!row.checked_out_at && !row.picked_up_by_name) continue;

    items.push({
      id: `child-${row.check_in_id}`,
      kind: "child",
      on: row.session_date,
      title: row.picked_up_by_name
        ? `${row.child_name} collected by ${row.picked_up_by_name}`
        : `${row.child_name} checked out`,
      detail: row.service_label,
    });
  }

  for (const row of input.serving) {
    if (!row.start_date) continue;
    items.push({
      id: `serving-${row.assignment_id}`,
      kind: "serving",
      on: row.start_date,
      title: `Started serving in ${row.ministry_name}`,
      detail: row.role_name,
    });
  }

  /*
   * Newest first, and ties broken by id so the order is stable.
   *
   * Ties are not an edge case here: two gifts on one Sunday and a child
   * collected the same morning all carry the same date, and an unstable sort
   * would let them swap places between renders for no reason a reader could
   * account for.
   */
  items.sort((a, b) => (a.on === b.on ? a.id.localeCompare(b.id) : a.on < b.on ? 1 : -1));

  /*
   * No age cutoff. A member who gave once, three years ago, should still see
   * that it was recorded rather than an empty card implying it was not — the
   * date label says plainly how long ago it was.
   */
  return items.slice(0, input.limit ?? 6);
}
