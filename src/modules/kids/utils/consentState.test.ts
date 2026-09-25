import { describe, it, expect } from "vitest";
import {
  CONSENT_STATES,
  isCovered,
  resignStatus,
  familyMessage,
  deskMessage,
  type ConsentState,
} from "./consentState";

describe("isCovered", () => {
  it("counts covered_elsewhere as covered", () => {
    // Coverage follows the child. Nobody withdrew anything when the family
    // moved, so nothing lapsed, and the gate must not refuse them.
    expect(isCovered("covered")).toBe(true);
    expect(isCovered("covered_elsewhere")).toBe(true);
  });

  it("does not count a family who signed without naming this child", () => {
    expect(isCovered("child_not_on_signature")).toBe(false);
  });

  it("refuses a form that outlasted its grace period", () => {
    expect(isCovered("consent_out_of_date")).toBe(false);
  });

  it("refuses the rest", () => {
    expect(isCovered("revoked")).toBe(false);
    expect(isCovered("no_signature")).toBe(false);
    expect(isCovered("no_household")).toBe(false);
  });
});

describe("resignStatus", () => {
  const today = new Date(2026, 9, 1); // 1 October 2026

  it("is not stale when no deadline is set", () => {
    expect(resignStatus(null, today)).toEqual({
      stale: false, daysLeft: null, overdue: false,
    });
  });

  it("counts the days left inside the grace period", () => {
    expect(resignStatus("2026-10-29", today)).toEqual({
      stale: true, daysLeft: 28, overdue: false,
    });
  });

  it("is stale but NOT overdue on the due date itself", () => {
    // The family was told "by the 1st". The 1st is still theirs.
    expect(resignStatus("2026-10-01", today)).toEqual({
      stale: true, daysLeft: 0, overdue: false,
    });
  });

  it("is overdue the day after", () => {
    const r = resignStatus("2026-09-30", today);
    expect(r.overdue).toBe(true);
    expect(r.daysLeft).toBe(-1);
  });

  it("treats an unreadable date as not stale rather than as overdue", () => {
    // Guessing "overdue" from a date we cannot parse would refuse a child
    // over a bug. Failing open here is safe: the SERVER decides the state,
    // and this only drives what the screen says.
    expect(resignStatus("nonsense", today).stale).toBe(false);
  });
});

describe("familyMessage", () => {
  it("has copy for every state", () => {
    for (const state of CONSENT_STATES) {
      const m = familyMessage(state, "Selam");
      expect(m.headline.length).toBeGreaterThan(0);
      expect(m.body.length).toBeGreaterThan(0);
    }
  });

  it("does not blame a family who did the right thing", () => {
    // They told us about a change; that is what the form asks of them. The
    // copy must read as paperwork, not as a reprimand.
    const m = familyMessage("consent_out_of_date", "Selam");
    expect(m.body).toContain("You told us about a change");
    expect(m.body).not.toMatch(/failed|must|required|overdue|violation/i);
  });

  it("never tells a family who has signed that they have not", () => {
    // The exact failure the six states exist to prevent.
    const m = familyMessage("child_not_on_signature", "Selam");
    expect(m.body).toContain("has filled in the consent form");
    expect(m.body).not.toMatch(/have not (filled|signed)/i);
  });

  it("gives a different sentence for never-signed than for not-named", () => {
    expect(familyMessage("no_signature", "Selam").headline).not.toBe(
      familyMessage("child_not_on_signature", "Selam").headline,
    );
  });

  it("names the child in every sentence that is about a child", () => {
    for (const state of CONSENT_STATES) {
      expect(familyMessage(state, "Selam").body).toContain("Selam");
    }
  });

  it("offers a way forward wherever the family can act", () => {
    expect(familyMessage("no_signature", "Selam").action).not.toBeNull();
    expect(familyMessage("child_not_on_signature", "Selam").action).not.toBeNull();
    expect(familyMessage("revoked", "Selam").action).not.toBeNull();
  });

  it("tells a covered family that nothing is needed", () => {
    expect(familyMessage("covered", "Selam").action).toBeNull();
    expect(familyMessage("covered", "Selam").tone).toBe("ok");
  });

  it("names the remedy when the church is the one that has to act", () => {
    // no_household has no self-service fix, so the copy must send them to a
    // person rather than leave them at a dead end.
    const m = familyMessage("no_household", "Selam");
    expect(m.action).toBeNull();
    expect(m.body).toMatch(/Kids Ministry team/);
  });

  it("reads pastorally: no exclamation marks anywhere", () => {
    for (const state of CONSENT_STATES) {
      const m = familyMessage(state, "Selam");
      expect(m.headline).not.toContain("!");
      expect(m.body).not.toContain("!");
    }
  });
});

describe("deskMessage", () => {
  it("tells a volunteer nothing about another household", () => {
    // A child whose consent lives with a different household is usually a
    // child whose parents have separated. A volunteer must not learn a
    // custody history from a check-in screen.
    const m = deskMessage("covered_elsewhere");
    expect(m.label).not.toMatch(/household|elsewhere|another|other/i);
    expect(m.hint ?? "").not.toMatch(/household|elsewhere|another|other/i);
  });

  it("is byte-identical for covered and covered_elsewhere", () => {
    expect(deskMessage("covered_elsewhere")).toEqual(deskMessage("covered"));
  });

  it("does not tell a volunteer that a consent was withdrawn", () => {
    const m = deskMessage("revoked");
    expect(m.label).not.toMatch(/withdraw|revoke/i);
    expect(m.hint ?? "").not.toMatch(/withdraw|revoke/i);
  });

  it("tells a volunteer nothing about a family's medical changes", () => {
    const m = deskMessage("consent_out_of_date");
    expect(m.label).not.toMatch(/medical|allergy|out of date|expired/i);
    expect(m.hint ?? "").not.toMatch(/medical|allergy/i);
  });

  it("gives the same label to all four fixable states", () => {
    const fixable: ConsentState[] = [
      "consent_out_of_date", "child_not_on_signature", "revoked", "no_signature",
    ];
    const labels = new Set(fixable.map((s) => deskMessage(s).label));
    expect(labels.size).toBe(1);
  });

  it("carries meaning in words, not only in colour", () => {
    // The kiosk is a public-facing device and colour alone is not an
    // accessible signal.
    for (const state of CONSENT_STATES) {
      expect(deskMessage(state).label.trim().length).toBeGreaterThan(3);
    }
  });

  it("sends a child with no guardian to a leader rather than to a form", () => {
    const m = deskMessage("no_household");
    expect(m.tone).toBe("blocked");
    expect(m.hint).toMatch(/leader/i);
  });
});
