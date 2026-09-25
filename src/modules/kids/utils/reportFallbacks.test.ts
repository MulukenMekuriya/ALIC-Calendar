import { describe, it, expect } from "vitest";

/**
 * The shape of the bug this file exists for.
 *
 * Three screens were shipped reading columns that arrive with a migration.
 * Against the not-yet-migrated database every one of those fields came back
 * `undefined`, and the screens did not degrade — they went blank or nearly so:
 *
 *   - the exceptions tab showed a badge of 124 and an EMPTY list, because rows
 *     were grouped by a `category` that did not exist yet;
 *   - the volunteer picker showed 3 people out of 660, because it filtered on
 *     an `on_kids_team` that was undefined for every row.
 *
 * Both are worse than the screens they replaced. These tests pin the two
 * fallbacks so the next column added this way cannot blank a safety report.
 */

const KNOWN = new Set([
  "not_collected",
  "refused",
  "override",
  "error",
  "transfer",
  "placement",
]);
const UNGROUPED = "__ungrouped__";

/** Mirrors the grouping in KidsReportsTab. */
function groupExceptions(rows: { category?: string }[]) {
  const map = new Map<string, { category?: string }[]>();
  for (const row of rows) {
    const key =
      row.category && KNOWN.has(row.category) ? row.category : UNGROUPED;
    const bucket = map.get(key);
    if (bucket) bucket.push(row);
    else map.set(key, [row]);
  }
  return map;
}

/** Mirrors the team detection in VolunteersTab. */
function serverKnowsTeam(people: { on_kids_team?: boolean }[]) {
  return people.some((p) => p.on_kids_team !== undefined);
}

describe("exceptions grouping falls back rather than blanking", () => {
  it("keeps every row when the server sends no category at all", () => {
    // Exactly the reported bug: 124 rows, none grouped, list rendered empty.
    const rows = Array.from({ length: 124 }, () => ({}));
    const grouped = groupExceptions(rows);
    const shown = [...grouped.values()].flat().length;
    expect(shown).toBe(124);
    expect(grouped.has(UNGROUPED)).toBe(true);
  });

  it("keeps a row whose category is newer than this build", () => {
    const grouped = groupExceptions([{ category: "something_new" }]);
    expect([...grouped.values()].flat()).toHaveLength(1);
  });

  it("still groups properly once the column exists", () => {
    const grouped = groupExceptions([
      { category: "not_collected" },
      { category: "not_collected" },
      { category: "refused" },
    ]);
    expect(grouped.get("not_collected")).toHaveLength(2);
    expect(grouped.get("refused")).toHaveLength(1);
    expect(grouped.has(UNGROUPED)).toBe(false);
  });

  it("never loses a row, whatever the mix", () => {
    const rows = [
      { category: "refused" },
      {},
      { category: "made_up" },
      { category: "override" },
    ];
    expect([...groupExceptions(rows).values()].flat()).toHaveLength(rows.length);
  });
});

describe("volunteer team filter only engages when the server can answer", () => {
  it("does not filter when the field is absent from every row", () => {
    const people = [{}, {}, {}];
    expect(serverKnowsTeam(people)).toBe(false);
  });

  it("filters once the server sends the field, even when all are false", () => {
    // All-false is a real answer: nobody is on the team. Undefined is not.
    const people = [{ on_kids_team: false }, { on_kids_team: false }];
    expect(serverKnowsTeam(people)).toBe(true);
  });

  it("filters when the server sends a mix", () => {
    expect(serverKnowsTeam([{ on_kids_team: true }, {}])).toBe(true);
  });

  it("does not filter an empty directory into a confusing empty state", () => {
    expect(serverKnowsTeam([])).toBe(false);
  });
});
