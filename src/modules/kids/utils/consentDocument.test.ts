import { describe, it, expect } from "vitest";
import {
  sectionsForSurface,
  allOptionKeys,
  missingAcknowledgments,
  sectionForOption,
  unsatisfiableRequirements,
  isPerChild,
  type ConsentDocument,
  type ConsentSection,
} from "./consentDocument";

/**
 * A stand-in with the same SHAPE as ALIC's seeded form, not its words. The
 * real copy lives in church.consent_documents and a test that pinned it here
 * would be pinning it in two places, which is exactly the drift the design
 * exists to prevent.
 */
function section(
  key: string,
  kind: ConsentSection["kind"],
  surface: ConsentSection["surface"],
  options: string[] = [],
): ConsentSection {
  return {
    key,
    heading: key,
    kind,
    surface,
    options: options.map((o) => ({ key: o, text: o })),
  };
}

const BODY: ConsentSection[] = [
  section("child_information", "children", "both"),
  section("participation", "acknowledgments", "both", ["participation_consent"]),
  section("safety_acknowledgment", "acknowledgments", "both", [
    "safety_remain_on_premises",
    "safety_checkout_procedure",
    "safety_supervision_window",
    "safety_reachable",
  ]),
  section("health_information", "fields", "both", [
    "health_none_known",
    "health_condition_known",
  ]),
  section("sick_policy", "acknowledgments", "portal", ["sick_policy_understood"]),
  section("emergency_medical", "acknowledgments", "both", [
    "emergency_medical_authorization",
  ]),
  section("physician_insurance", "fields", "portal"),
  section("photo_video", "choice", "both", ["photo_permitted", "photo_declined"]),
  section("acknowledgment", "signature", "both", ["parent_acknowledgment"]),
];

const REQUIRED = [
  "participation_consent",
  "safety_remain_on_premises",
  "safety_checkout_procedure",
  "safety_supervision_window",
  "safety_reachable",
  "emergency_medical_authorization",
  "parent_acknowledgment",
];

const DOC: ConsentDocument = {
  document_id: "d1",
  code: "kids_parent_consent",
  version: 1,
  title: "Parent / Guardian Consent",
  body: BODY,
  body_sha256: "a".repeat(64),
  required_acknowledgments: REQUIRED,
  effective_from: "2026-09-25",
};

describe("sectionsForSurface", () => {
  it("drops portal-only sections from the kiosk", () => {
    const keys = sectionsForSurface(BODY, "kiosk").map((s) => s.key);
    expect(keys).not.toContain("sick_policy");
    expect(keys).not.toContain("physician_insurance");
  });

  it("keeps the 911 authorisation on the kiosk", () => {
    // The clause that cannot wait for a portal visit that may never happen.
    // 42 of 292 adults in these households have no login at all.
    const keys = sectionsForSurface(BODY, "kiosk").map((s) => s.key);
    expect(keys).toContain("emergency_medical");
  });

  it("keeps all four safety acknowledgments on the kiosk", () => {
    const safety = sectionsForSurface(BODY, "kiosk").find(
      (s) => s.key === "safety_acknowledgment",
    );
    // Four, individually. One combined tick is one thing to deny afterwards.
    expect(safety?.options).toHaveLength(4);
  });

  it("returns everything for the portal", () => {
    expect(sectionsForSurface(BODY, "portal")).toHaveLength(BODY.length);
  });

  it("treats a section with no surface as 'both'", () => {
    const body = [{ key: "x", heading: "X", kind: "statement" } as ConsentSection];
    expect(sectionsForSurface(body, "kiosk")).toHaveLength(1);
    expect(sectionsForSurface(body, "portal")).toHaveLength(1);
  });

  it("preserves document order", () => {
    const keys = sectionsForSurface(BODY, "kiosk").map((s) => s.key);
    expect(keys.indexOf("participation")).toBeLessThan(keys.indexOf("acknowledgment"));
  });
});

describe("missingAcknowledgments", () => {
  it("is empty when everything required is ticked", () => {
    expect(missingAcknowledgments(REQUIRED, REQUIRED)).toEqual([]);
  });

  it("names the unticked ones, in the document's order", () => {
    const ticked = REQUIRED.filter((k) => k !== "safety_reachable" && k !== "participation_consent");
    expect(missingAcknowledgments(REQUIRED, ticked)).toEqual([
      "participation_consent",
      "safety_reachable",
    ]);
  });

  it("ignores extra ticks that are not required", () => {
    expect(missingAcknowledgments(REQUIRED, [...REQUIRED, "snack_authorized"])).toEqual([]);
  });

  it("does not accept three of the four safety ticks as four", () => {
    // The reason section 3 is four keys rather than one.
    const ticked = REQUIRED.filter((k) => k !== "safety_checkout_procedure");
    expect(missingAcknowledgments(REQUIRED, ticked)).toEqual(["safety_checkout_procedure"]);
  });

  it("does not require the 'no known allergies' declaration", () => {
    // A form that silently asserts a negative because nobody asked is worse
    // than no form. 10 of 534 children have any medical record at all today.
    expect(REQUIRED).not.toContain("health_none_known");
    expect(missingAcknowledgments(REQUIRED, REQUIRED)).toEqual([]);
  });
});

describe("sectionForOption", () => {
  it("finds the section a required key belongs to", () => {
    expect(sectionForOption(BODY, "safety_reachable")?.key).toBe("safety_acknowledgment");
  });

  it("returns null for a key no section offers", () => {
    expect(sectionForOption(BODY, "nope")).toBeNull();
  });
});

describe("unsatisfiableRequirements", () => {
  it("is empty for a document the server would accept", () => {
    expect(unsatisfiableRequirements(DOC)).toEqual([]);
  });

  it("catches a required key that names no option", () => {
    const broken = { ...DOC, required_acknowledgments: [...REQUIRED, "ghost"] };
    expect(unsatisfiableRequirements(broken)).toEqual(["ghost"]);
  });
});

describe("allOptionKeys", () => {
  it("collects across sections and skips sections with none", () => {
    const keys = allOptionKeys(BODY);
    expect(keys).toContain("participation_consent");
    expect(keys).toContain("photo_declined");
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("tolerates a null options list", () => {
    const body = [
      { key: "x", heading: "X", kind: "statement", options: null } as ConsentSection,
    ];
    expect(allOptionKeys(body)).toEqual([]);
  });
});

describe("isPerChild", () => {
  it("marks photo consent as per child", () => {
    // photo_consent is a per-child column, and one household answer applied
    // to N children overwrites real differences between them.
    expect(isPerChild(section("photo_video", "choice", "both"))).toBe(true);
  });

  it("does not mark the household-wide sections", () => {
    expect(isPerChild(section("off_site", "choice", "both"))).toBe(false);
    expect(isPerChild(section("snack", "choice", "both"))).toBe(false);
  });
});
