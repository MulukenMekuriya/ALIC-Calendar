import { describe, it, expect } from "vitest";
import {
  CONSENT_STATES,
  isCovered,
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

  it("refuses the rest", () => {
    expect(isCovered("revoked")).toBe(false);
    expect(isCovered("no_signature")).toBe(false);
    expect(isCovered("no_household")).toBe(false);
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

  it("gives the same label to all three fixable states", () => {
    const fixable: ConsentState[] = ["child_not_on_signature", "revoked", "no_signature"];
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
