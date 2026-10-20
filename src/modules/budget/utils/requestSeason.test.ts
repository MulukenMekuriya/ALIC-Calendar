import { describe, expect, it } from "vitest";
import type { RequestSeason } from "../types";
import { canStartRequest, isRequestLocked, seasonDay, seasonNotice } from "./requestSeason";

const season = (over: Partial<RequestSeason> = {}): RequestSeason => ({
  enforced: true,
  fiscal_year: 2027,
  fiscal_year_id: "fy-2027",
  opens_at: "2026-09-01T04:00:00+00:00",
  closes_at: "2026-11-02T05:00:00+00:00",
  opens_on: "2026-09-01",
  last_day: "2026-11-01",
  state: "open",
  days_left: 12,
  can_bypass: false,
  ...over,
});

describe("the budget request season", () => {
  it("names the day without moving it across a time zone", () => {
    expect(seasonDay("2026-11-01")).toBe("Sunday, November 1");
    expect(seasonDay("2026-09-01")).toBe("Tuesday, September 1");
  });

  it("lets a contributor change only the year in season, while it is open", () => {
    expect(isRequestLocked(season(), "fy-2027")).toBe(false);
    expect(isRequestLocked(season(), "fy-2026")).toBe(true);
    expect(isRequestLocked(season({ state: "closed", days_left: null }), "fy-2027")).toBe(true);
    expect(isRequestLocked(season({ state: "upcoming", days_left: null }), "fy-2027")).toBe(true);
    expect(isRequestLocked(season({ fiscal_year_id: null }), null)).toBe(true);
  });

  it("does not lock an admin of the branch, or a branch without a season", () => {
    expect(isRequestLocked(season({ state: "closed", can_bypass: true }), "fy-2026")).toBe(false);
    expect(isRequestLocked(season({ enforced: false, state: "closed" }), "fy-2026")).toBe(false);
    // Still loading: the database is the rule, so do not hide anything yet.
    expect(isRequestLocked(undefined, "fy-2026")).toBe(false);
  });

  it("offers a new request only when one can be made", () => {
    expect(canStartRequest(season())).toBe(true);
    expect(canStartRequest(season({ state: "closed", days_left: null }))).toBe(false);
    expect(canStartRequest(season({ state: "closed", days_left: null, can_bypass: true }))).toBe(true);
  });

  it("counts down, and is urgent in the last five days", () => {
    expect(seasonNotice(season(), false)).toMatchObject({
      tone: "open",
      title: "2027 budget requests are due Sunday, November 1",
    });
    expect(seasonNotice(season({ days_left: 4 }), false)?.tone).toBe("urgent");
    expect(seasonNotice(season({ days_left: 0 }), false)?.body).toMatch(/^Today is the last day\./);
    expect(seasonNotice(season({ days_left: 1 }), false)?.body).toMatch(/^1 day left\./);
  });

  it("tells a ministry that has submitted that it can still edit", () => {
    expect(seasonNotice(season(), true)).toEqual({
      tone: "open",
      title: "Your 2027 budget request is in",
      body: "You can still review and edit it until Sunday, November 1.",
    });
  });

  it("after the close, sends a contributor to an administrator", () => {
    const closed = season({ state: "closed", days_left: null });
    expect(seasonNotice(closed, false)?.body).toBe(
      "To change a request now, please ask an administrator.",
    );
    expect(seasonNotice({ ...closed, can_bypass: true }, false)?.body).toMatch(/administrator you can still/);
  });

  it("announces the opening only in the month before it", () => {
    const upcoming = season({
      fiscal_year: 2028,
      state: "upcoming",
      days_left: null,
      opens_at: "2027-09-01T04:00:00+00:00",
      opens_on: "2027-09-01",
      last_day: "2027-11-01",
    });
    expect(seasonNotice(upcoming, false, new Date("2027-03-01T12:00:00Z"))).toBeNull();
    expect(seasonNotice(upcoming, false, new Date("2027-08-15T12:00:00Z"))?.title).toBe(
      "2028 budget requests open on Wednesday, September 1",
    );
  });

  it("says nothing in a branch without a season", () => {
    expect(seasonNotice(season({ enforced: false }), false)).toBeNull();
  });
});
