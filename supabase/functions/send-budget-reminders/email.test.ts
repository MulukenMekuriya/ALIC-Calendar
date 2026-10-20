import { describe, expect, it } from "vitest";
import { compose, daysLeft, FORM_URL, renderEmail, renderText, type ReminderRow } from "./email.ts";

const row = (over: Partial<ReminderRow> = {}): ReminderRow => ({
  id: "r1",
  stage: "reminder",
  fiscal_year: 2027,
  send_on: "2026-10-22",
  opens_on: "2026-09-01",
  last_day: "2026-11-01",
  recipient_name: "Muluken Mekuriya",
  recipient_email: "leader@example.test",
  ministry_names: ["Alic MD Youth"],
  signed_by: "ALIC MD Leadership Council",
  ...over,
});

describe("the budget request reminder", () => {
  it("works every date out from the row, so next year needs no change", () => {
    const next = row({
      fiscal_year: 2028, send_on: "2027-10-28", stage: "final",
      opens_on: "2027-09-01", last_day: "2027-11-01",
    });
    const c = compose(next);
    expect(c.subject).toBe("4 days left: 2028 budget requests are due November 1");
    // 1 November 2027 is a Monday.
    expect(c.fact.value).toBe("Monday, November\u00a01");
    expect(c.paragraphs.join(" ")).toContain("carried over for 2028");
    expect(renderEmail(next)).toContain("Budget &amp; Calendar Requests · 2028");
    expect(renderEmail(next)).not.toMatch(/2027 budget|2026|Sunday/);
  });

  it("counts the days to the last day, which is day zero", () => {
    expect(daysLeft(row())).toBe(10);
    expect(daysLeft(row({ send_on: "2026-10-28" }))).toBe(4);
    expect(daysLeft(row({ send_on: "2026-11-01" }))).toBe(0);
  });

  it("says in the subject what is due and when, as the deadline nears", () => {
    expect(compose(row({ stage: "upcoming", send_on: "2026-08-15" })).subject).toBe(
      "The 2027 budget and calendar request form opens September 1",
    );
    expect(compose(row({ stage: "opened", send_on: "2026-09-01" })).subject).toBe(
      "The 2027 budget and calendar request form is now open",
    );
    expect(compose(row()).subject).toBe("Reminder: 2027 budget requests are due November 1");
    expect(compose(row({ stage: "final", send_on: "2026-10-28" })).subject).toBe(
      "4 days left: 2027 budget requests are due November 1",
    );
    expect(compose(row({ stage: "final", send_on: "2026-10-31" })).subject).toBe(
      "1 day left: 2027 budget requests are due November 1",
    );
    expect(compose(row({ stage: "final", send_on: "2026-11-01" })).subject).toBe(
      "Last day: 2027 budget requests are due today",
    );
  });

  it("names the ministries still missing, and nobody's on the day it opens", () => {
    const two = compose(row({ ministry_names: ["Alic MD Men's", "Alic MD Youth"] }));
    expect(two.paragraphs).toContain(
      "We have not yet received a 2027 budget request for Alic MD Men's and Alic MD Youth.",
    );
    expect(compose(row({ ministry_names: [] })).paragraphs).toContain(
      "We have not yet received a 2027 budget request from you.",
    );
    const opened = compose(row({ stage: "opened", send_on: "2026-09-01" }));
    expect(opened.paragraphs.join(" ")).not.toContain("not yet received");
  });

  it("locks budget requests only, and says last year's budget carries over", () => {
    const text = compose(row()).paragraphs.join(" ");
    expect(text).toContain("automatically lock budget requests after November 1");
    expect(text).not.toContain("lock all submissions");
    expect(text).toContain("last year’s budget will be carried over for 2027");
  });

  it("greets by first name and signs as the council", () => {
    const text = renderText(row());
    expect(text.startsWith("Selam Muluken,")).toBe(true);
    expect(text).toContain("Blessings,\nALIC MD Leadership Council");
    expect(renderText(row({ recipient_name: null })).startsWith("Selam,")).toBe(true);
  });

  it("links to the form, except before it opens", () => {
    expect(renderEmail(row())).toContain(`href="${FORM_URL.replace(/&/g, "&amp;")}"`);
    expect(renderText(row())).toContain(FORM_URL);
    expect(renderEmail(row({ stage: "upcoming", send_on: "2026-08-15" }))).not.toContain(FORM_URL);
  });

  it("escapes a ministry's name", () => {
    const html = renderEmail(row({ ministry_names: ["<b>Men's</b>"] }));
    expect(html).toContain("&lt;b&gt;Men&#39;s&lt;/b&gt;");
    expect(html).not.toContain("<b>Men's</b>");
  });

  it("carries the church's logo and name, like the other emails", () => {
    const html = renderEmail(row());
    expect(html).toContain('src="https://alic.org/alic-logo.png"');
    expect(html).toContain("Addis Lidet International Church");
    expect(html).toContain("Budget &amp; Calendar Requests · 2027");
  });
});
