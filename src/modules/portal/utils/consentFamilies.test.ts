import { describe, it, expect } from "vitest";
import { consentFamilies, consentNeededNames } from "./consentFamilies";
import type { MyConsentRow } from "@/modules/kids/services/consentService";

const row = (over: Partial<MyConsentRow>): MyConsentRow => ({
  organization_id: "org",
  household_id: "h1",
  household_name: "Bekele",
  signer_person_id: "mum",
  signer_name: "Meseret Bekele",
  child_person_id: "c1",
  child_name: "Hana Bekele",
  state: "no_signature",
  signature_id: null,
  signed_at: null,
  resign_due_by: null,
  has_pdf: false,
  ...over,
});

describe("consentFamilies", () => {
  it("gives a parent of two households two families", () => {
    const families = consentFamilies([
      row({}),
      row({ child_person_id: "c2", child_name: "Abel Bekele" }),
      row({ household_id: "h2", child_person_id: "c3", child_name: "Ruth Tesfaye" }),
    ]);
    expect(families.map((f) => f.children.length)).toEqual([2, 1]);
  });

  it("separates the children still missing from those on file, and finds the copy", () => {
    const [family] = consentFamilies([
      row({ state: "covered", signature_id: "s1", signed_at: "2026-09-27T15:00:00Z", has_pdf: true }),
      row({ child_person_id: "c2", child_name: "Abel Bekele", state: "child_not_on_signature" }),
    ]);
    expect(family.missing.map((m) => m.child_person_id)).toEqual(["c2"]);
    expect(family.signatureId).toBe("s1");
  });
});

describe("consentNeededNames", () => {
  it("names a child with no form, and a covered child due to sign again", () => {
    expect(
      consentNeededNames([
        row({}),
        row({ child_person_id: "c2", child_name: "Abel Bekele", state: "covered", resign_due_by: "2026-11-05" }),
        row({ child_person_id: "c3", child_name: "Liya Bekele", state: "covered" }),
      ]),
    ).toEqual(["Hana", "Abel"]);
  });
});
