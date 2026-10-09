/**
 * My consent rows, a family at a time, and the names the overview asks about.
 *
 * Pure, so the grouping can be tested without a database: a parent of two
 * households sees two cards, and a child counts as "needed" both when no form
 * is in effect and when one is but must be signed again by a date.
 */

import type { MyConsentRow } from "@/modules/kids/services/consentService";
import { isCovered } from "@/modules/kids/utils/consentState";
import type { ConsentHousehold } from "../components/ConsentFormDialog";

export interface FamilyConsent extends ConsentHousehold {
  rows: MyConsentRow[];
  /** Children with no form in effect. */
  missing: MyConsentRow[];
  /** Covered, but asked to sign again by a date after a medical change. */
  resignBy: string | null;
  /** The form on file, when there is one to open. */
  signatureId: string | null;
  signedAt: string | null;
}

export const firstName = (full: string) => full.split(/\s+/)[0] ?? full;

export function formatConsentDate(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}

/** My consent rows, a family at a time. */
export function consentFamilies(rows: MyConsentRow[]): FamilyConsent[] {
  const byHousehold = new Map<string, MyConsentRow[]>();
  for (const r of rows) {
    byHousehold.set(r.household_id, [...(byHousehold.get(r.household_id) ?? []), r]);
  }
  return [...byHousehold.values()].map((family) => {
    const first = family[0];
    const covered = family.filter((r) => isCovered(r.state));
    const onFile = covered.find((r) => r.signature_id && r.has_pdf) ?? null;
    const due = covered.map((r) => r.resign_due_by).filter((d): d is string => !!d).sort()[0];
    return {
      organizationId: first.organization_id,
      householdId: first.household_id,
      signerPersonId: first.signer_person_id,
      signerName: first.signer_name,
      children: family.map((r) => ({ id: r.child_person_id, name: r.child_name })),
      rows: family,
      missing: family.filter((r) => !isCovered(r.state)),
      resignBy: due ?? null,
      signatureId: onFile?.signature_id ?? null,
      signedAt: onFile?.signed_at ?? null,
    };
  });
}

/** First names of every child whose form is missing or due again, for the overview. */
export function consentNeededNames(rows: MyConsentRow[] | undefined): string[] {
  return (rows ?? [])
    .filter((r) => !isCovered(r.state) || !!r.resign_due_by)
    .map((r) => firstName(r.child_name));
}

