/**
 * Deleting one occurrence of a recurring event does not delete the year.
 *
 * Every occurrence of a series points at the first one through
 * parent_event_id, declared ON DELETE CASCADE. So "Delete Only This Event" on
 * the first occurrence — the one at the top of the review board, the one an
 * admin reaches for when week one is cancelled — quietly took all 52 with it,
 * and said "Event deleted" while doing it.
 *
 * The fake below reproduces that cascade, because a test that does not cascade
 * cannot fail on the bug it is here to catch.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

interface Row {
  id: string;
  starts_at: string;
  parent_event_id: string | null;
  recurrence_rule?: string | null;
  recurrence_end_date?: string | null;
}

let rows: Row[] = [];
/** Stands in for a row-level policy that refuses: it matches nothing, silently. */
let refuseUpdates = false;

interface QueryState {
  op: "select" | "delete" | "update";
  filters: Array<(row: Row) => boolean>;
  values: Partial<Row> | null;
  orderBy: keyof Row | null;
}

const run = (state: QueryState) => {
  const matches = (row: Row) => state.filters.every((f) => f(row));

  if (state.op === "delete") {
    const removed = rows.filter(matches);
    const removedIds = new Set(removed.map((r) => r.id));

    // ON DELETE CASCADE: anything parented by a deleted row goes with it, and
    // so on down. Each pass only follows rows found in the previous one, or a
    // failing case would spin here instead of failing.
    let frontier = new Set(removedIds);
    while (frontier.size > 0) {
      const next = new Set<string>();
      rows.forEach((row) => {
        if (row.parent_event_id && frontier.has(row.parent_event_id) && !removedIds.has(row.id)) {
          removedIds.add(row.id);
          next.add(row.id);
        }
      });
      frontier = next;
    }

    rows = rows.filter((r) => !removedIds.has(r.id));
    return { data: removed.map((r) => ({ id: r.id })), error: null };
  }

  if (state.op === "update") {
    if (refuseUpdates) return { data: [], error: null };
    const updated = rows.filter(matches);
    updated.forEach((row) => Object.assign(row, state.values));
    return { data: updated.map((r) => ({ id: r.id })), error: null };
  }

  let selected = rows.filter(matches);
  if (state.orderBy) {
    const key = state.orderBy;
    selected = [...selected].sort((a, b) => String(a[key]).localeCompare(String(b[key])));
  }
  return { data: selected.map((r) => ({ ...r })), error: null };
};

const from = () => {
  const state: QueryState = { op: "select", filters: [], values: null, orderBy: null };

  const api = {
    select: () => api,
    delete: () => {
      state.op = "delete";
      return api;
    },
    update: (values: Partial<Row>) => {
      state.op = "update";
      state.values = values;
      return api;
    },
    eq: (column: keyof Row, value: unknown) => {
      state.filters.push((row) => row[column] === value);
      return api;
    },
    in: (column: keyof Row, values: unknown[]) => {
      state.filters.push((row) => values.includes(row[column]));
      return api;
    },
    order: (column: keyof Row) => {
      state.orderBy = column;
      return api;
    },
    single: () => {
      const { data, error } = run(state);
      return Promise.resolve({ data: data[0] ?? null, error });
    },
    then: (resolve: (value: ReturnType<typeof run>) => unknown) => Promise.resolve(run(state)).then(resolve),
  };

  return api;
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => from() },
}));

import { eventService } from "./eventService";

/** A weekly series: the first occurrence, then three more hanging off it. */
const weeklySeries = (): Row[] => [
  {
    id: "week-1",
    starts_at: "2027-01-04T10:00:00-05:00",
    parent_event_id: null,
    recurrence_rule: "FREQ=WEEKLY;BYDAY=MO",
    recurrence_end_date: "2027-01-25T10:00:00-05:00",
  },
  { id: "week-2", starts_at: "2027-01-11T10:00:00-05:00", parent_event_id: "week-1" },
  { id: "week-3", starts_at: "2027-01-18T10:00:00-05:00", parent_event_id: "week-1" },
  { id: "week-4", starts_at: "2027-01-25T10:00:00-05:00", parent_event_id: "week-1" },
];

beforeEach(() => {
  rows = weeklySeries();
  refuseUpdates = false;
});

describe("eventService.deleteScoped", () => {
  it("deletes a standalone event", async () => {
    rows = [{ id: "one-off", starts_at: "2027-12-04T09:00:00-05:00", parent_event_id: null }];

    const removed = await eventService.deleteScoped({ id: "one-off", parent_event_id: null }, "single");

    expect(removed).toBe(1);
    expect(rows).toHaveLength(0);
  });

  it("deletes a later occurrence without touching the rest", async () => {
    const removed = await eventService.deleteScoped({ id: "week-3", parent_event_id: "week-1" }, "single");

    expect(removed).toBe(1);
    expect(rows.map((r) => r.id)).toEqual(["week-1", "week-2", "week-4"]);
  });

  it("keeps the series when its first occurrence is the one cancelled", async () => {
    const removed = await eventService.deleteScoped({ id: "week-1", parent_event_id: null }, "single");

    expect(removed).toBe(1);
    expect(rows.map((r) => r.id)).toEqual(["week-2", "week-3", "week-4"]);
  });

  it("hands the series to the next occurrence, rule and all", async () => {
    await eventService.deleteScoped({ id: "week-1", parent_event_id: null }, "single");

    const heir = rows.find((r) => r.id === "week-2");
    expect(heir?.parent_event_id).toBeNull();
    expect(heir?.recurrence_rule).toBe("FREQ=WEEKLY;BYDAY=MO");
    expect(heir?.recurrence_end_date).toBe("2027-01-25T10:00:00-05:00");

    // And the rest now hang off the promoted occurrence, so the series is
    // still a series: deleting it whole later still finds every member.
    expect(rows.filter((r) => r.parent_event_id === "week-2").map((r) => r.id)).toEqual(["week-3", "week-4"]);
  });

  it("deletes every occurrence when the whole series is chosen", async () => {
    const removed = await eventService.deleteScoped({ id: "week-1", parent_event_id: null }, "all");

    expect(removed).toBe(4);
    expect(rows).toHaveLength(0);
  });

  it("deletes the whole series when asked from a later occurrence", async () => {
    const removed = await eventService.deleteScoped({ id: "week-3", parent_event_id: "week-1" }, "all");

    expect(removed).toBe(4);
    expect(rows).toHaveLength(0);
  });

  it("reports nothing removed when the policies refuse, instead of claiming success", async () => {
    rows = [{ id: "someone-elses", starts_at: "2027-03-01T10:00:00-05:00", parent_event_id: null }];

    const removed = await eventService.deleteScoped({ id: "not-visible", parent_event_id: null }, "single");

    expect(removed).toBe(0);
    expect(rows).toHaveLength(1);
  });

  it("refuses to delete a first occurrence it cannot hand over", async () => {
    // If the handover is refused and the delete goes ahead anyway, the cascade
    // takes the series. Better to stop with everything still there.
    refuseUpdates = true;

    await expect(
      eventService.deleteScoped({ id: "week-1", parent_event_id: null }, "single")
    ).rejects.toThrow(/could not be handed over/);

    expect(rows).toHaveLength(4);
  });
});
