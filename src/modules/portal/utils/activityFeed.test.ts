import { describe, it, expect } from "vitest";
import { buildActivityFeed, type ActivityInputs } from "./activityFeed";

const EMPTY: ActivityInputs = { gifts: [], checkIns: [], serving: [] };

const gift = (id: string, on: string, cents = 10000) => ({
  id,
  received_on: on,
  amount_cents: cents,
  fund_name: "General Fund",
  method: "card",
});

const collected = (id: string, on: string) => ({
  check_in_id: id,
  child_name: "Selam",
  session_date: on,
  service_label: "Second service",
  picked_up_by_name: "Muluken Mekuriya",
  checked_out_at: `${on}T11:42:00Z`,
});

describe("buildActivityFeed", () => {
  it("has nothing to show when nothing has been recorded", () => {
    expect(buildActivityFeed(EMPTY)).toEqual([]);
  });

  it("merges three histories into one order, newest first", () => {
    const feed = buildActivityFeed({
      gifts: [gift("g1", "2026-09-06"), gift("g2", "2026-07-05")],
      checkIns: [collected("c1", "2026-09-06")],
      serving: [
        {
          assignment_id: "s1",
          ministry_name: "Media & Sound",
          role_name: "Team lead",
          start_date: "2024-02-01",
        },
      ],
      limit: 10,
    });
    expect(feed.map((i) => i.on)).toEqual([
      "2026-09-06",
      "2026-09-06",
      "2026-07-05",
      "2024-02-01",
    ]);
    expect(feed.map((i) => i.kind)).toEqual(["child", "gift", "gift", "serving"]);
  });

  it("orders same-day items stably rather than letting them swap on re-render", () => {
    const input: ActivityInputs = {
      ...EMPTY,
      gifts: [gift("b", "2026-09-06"), gift("a", "2026-09-06"), gift("c", "2026-09-06")],
    };
    const once = buildActivityFeed(input).map((i) => i.id);
    const again = buildActivityFeed(input).map((i) => i.id);
    expect(once).toEqual(again);
    expect(once).toEqual(["gift-a", "gift-b", "gift-c"]);
  });

  it("never shows a check-in that has not finished", () => {
    // An open check-in carries where a child is sitting right now, which is a
    // question for the desk and not for any login. See 20260322000600.
    const feed = buildActivityFeed({
      ...EMPTY,
      checkIns: [
        {
          check_in_id: "open",
          child_name: "Selam",
          session_date: "2026-09-06",
          service_label: "Second service",
          picked_up_by_name: null,
          checked_out_at: null,
        },
      ],
    });
    expect(feed).toEqual([]);
  });

  it("counts a checked-out row with no collector name as finished", () => {
    const feed = buildActivityFeed({
      ...EMPTY,
      checkIns: [
        {
          check_in_id: "c2",
          child_name: "Dawit",
          session_date: "2026-09-06",
          service_label: "First service",
          picked_up_by_name: null,
          checked_out_at: "2026-09-06T11:00:00Z",
        },
      ],
    });
    expect(feed).toHaveLength(1);
    expect(feed[0].title).toBe("Dawit checked out");
  });

  it("names who collected a child, because that is the question it answers", () => {
    const feed = buildActivityFeed({ ...EMPTY, checkIns: [collected("c1", "2026-09-06")] });
    expect(feed[0].title).toBe("Selam collected by Muluken Mekuriya");
    expect(feed[0].detail).toBe("Second service");
  });

  it("reads a gift the way the giving tab does", () => {
    const feed = buildActivityFeed({ ...EMPTY, gifts: [gift("g1", "2026-09-06", 12345)] });
    expect(feed[0].title).toBe("$123.45 recorded");
    expect(feed[0].detail).toBe("General Fund · Card");
  });

  it("falls back to the raw method when it is one the labels do not cover", () => {
    const feed = buildActivityFeed({
      ...EMPTY,
      gifts: [{ ...gift("g1", "2026-09-06"), method: "crypto" }],
    });
    expect(feed[0].detail).toBe("General Fund · crypto");
  });

  it("skips an assignment with no start date rather than filing it under today", () => {
    const feed = buildActivityFeed({
      ...EMPTY,
      serving: [
        { assignment_id: "s1", ministry_name: "Ushers", role_name: "Usher", start_date: "" },
      ],
    });
    expect(feed).toEqual([]);
  });

  it("caps the feed, defaulting to six", () => {
    const gifts = Array.from({ length: 12 }, (_, i) =>
      gift(`g${i}`, `2026-0${(i % 9) + 1}-01`)
    );
    expect(buildActivityFeed({ ...EMPTY, gifts })).toHaveLength(6);
    expect(buildActivityFeed({ ...EMPTY, gifts, limit: 3 })).toHaveLength(3);
  });

  it("keeps an old gift rather than implying it was never recorded", () => {
    const feed = buildActivityFeed({ ...EMPTY, gifts: [gift("g1", "2021-04-04")] });
    expect(feed).toHaveLength(1);
  });
});
