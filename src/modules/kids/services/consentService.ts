/**
 * Reading the church's consent form.
 *
 * Everything here goes through `church.current_consent_document`, a SECURITY
 * DEFINER RPC, rather than selecting from the table. That is not a style
 * choice: the lobby kiosk holds NO module grant at all — deliberately, because
 * any grant would lift the `public.profiles` RLS restriction and hand an
 * unattended tablet the name and email of every user in the branch — so a
 * grant-keyed table read returns it nothing. The definer RPC is the kiosk's
 * only door, and keeping every caller on it means the kiosk path is the
 * tested path rather than a special case.
 *
 * Signing lives in a later branch. This file only reads.
 */

import { supabase } from "@/integrations/supabase/client";
import { throwRpc } from "./rpcError";
import type { ConsentDocument, ConsentSection } from "../utils/consentDocument";
import type { ConsentState as ConsentStateValue } from "../utils/consentState";

const church = () => supabase.schema("church");

/** The code of the Kids Ministry form. Other forms would have other codes. */
export const KIDS_CONSENT_CODE = "kids_parent_consent";

interface RawConsentDocument {
  document_id: string;
  code: string;
  version: number;
  title: string;
  body: unknown;
  body_sha256: string;
  required_acknowledgments: string[] | null;
  effective_from: string;
}

/** The coverage card a kids admin reads before deciding on the go-live date. */
export interface ConsentCoverage {
  children_total: number;
  children_covered: number;
  children_uncovered: number;
  children_no_household: number;
  households_total: number;
  households_signed: number;
  signatures_unreviewed: number;
}

/** One child's consent position. See utils/consentState for what to say about it. */
export interface ChildConsentState {
  state: ConsentStateValue;
  signature_id: string | null;
  signed_at: string | null;
  document_version: number | null;
  /** When the medical record first changed after that form was signed. */
  medical_changed_at: string | null;
  /**
   * The date the family was told they have until. Set as soon as the form
   * goes out of date, and the child stays COVERED until it passes — see
   * resignStatus() in utils/consentState for why that direction matters.
   */
  resign_due_by: string | null;
}

/** A child's medical record, as their own household sees it. */
export interface ChildMedical {
  child_person_id: string;
  child_name: string;
  /**
   * False means nobody has ever filled this in — NOT "no allergies". The
   * distinction is the whole reason the column exists: a form that cannot
   * tell a stated negative from an unasked question will assert one.
   */
  has_record: boolean;
  allergy_severity: string | null;
  allergies: string | null;
  medications: string | null;
  medical_notes: string | null;
  special_needs: string | null;
  special_needs_flag: boolean | null;
  updated_at: string | null;
  updated_by_name: string | null;
}

export interface MedicalUpdateResult {
  changed: boolean;
  allergy_label: string | null;
  consent_now_stale: boolean;
  resign_due_by: string | null;
}

/** The four the database permits. There is deliberately no "moderate". */
export const ALLERGY_SEVERITIES = [
  "none",
  "mild",
  "severe",
  "life_threatening",
] as const;
export type AllergySeverity = (typeof ALLERGY_SEVERITIES)[number];

export const consentService = {
  /**
   * The form currently in force for a branch, filtered to one surface.
   *
   * Returns null when no document has been published, or when the published
   * one is not yet effective. Null is a real answer, not an error: a branch
   * that has not published a form yet simply cannot collect a signature, and
   * the screen should say so rather than show a spinner forever.
   */
  async currentDocument(
    organizationId: string,
    surface: "kiosk" | "portal" = "portal",
  ): Promise<ConsentDocument | null> {
    const { data, error } = await church().rpc("current_consent_document", {
      _organization_id: organizationId,
      _code: KIDS_CONSENT_CODE,
      _surface: surface,
    });
    throwRpc(error);

    const row = (data as unknown as RawConsentDocument[] | null)?.[0];
    if (!row) return null;

    return {
      document_id: row.document_id,
      code: row.code,
      version: row.version,
      title: row.title,
      // jsonb arrives as parsed JSON. Guard anyway: a body that is not an
      // array would otherwise crash the renderer with a stack trace in front
      // of a parent, and an empty form is the more honest failure.
      body: Array.isArray(row.body) ? (row.body as ConsentSection[]) : [],
      body_sha256: row.body_sha256,
      required_acknowledgments: row.required_acknowledgments ?? [],
      effective_from: row.effective_from,
    };
  },

  /**
   * How the signature collection is going, for the admin card.
   *
   * The two numbers answer different questions and both matter: 216
   * signatures cover 534 children, so "how many families" and "how many
   * children" diverge by a factor of two and a half. Reading only the child
   * count makes the job look larger than it is; reading only the household
   * count hides a family who signed without naming a new baby.
   */
  async coverage(organizationId: string): Promise<ConsentCoverage | null> {
    const { data, error } = await church().rpc("kids_consent_coverage", {
      _organization_id: organizationId,
    });
    throwRpc(error);
    return (data as unknown as ConsentCoverage[] | null)?.[0] ?? null;
  },

  /**
   * One child's consent position.
   *
   * Pass `forHouseholdId` from the portal so a parent is told the truth about
   * a child whose consent lives with another household. DO NOT pass it from a
   * check-in screen: the desk is meant to see plain 'covered', because a
   * volunteer must not learn a custody history from a check-in screen. The
   * server applies the same rule, so omitting it here is belt and braces
   * rather than the only guard.
   */
  async childState(
    childPersonId: string,
    forHouseholdId?: string | null,
  ): Promise<ChildConsentState | null> {
    const { data, error } = await church().rpc("child_consent_state", {
      _child_person_id: childPersonId,
      _for_household_id: forHouseholdId ?? null,
    });
    throwRpc(error);
    return (data as unknown as ChildConsentState[] | null)?.[0] ?? null;
  },

  /** A child's medical record, for their own household. */
  async childMedical(childPersonId: string): Promise<ChildMedical | null> {
    const { data, error } = await church().rpc("my_child_medical", {
      _child_person_id: childPersonId,
    });
    throwRpc(error);
    return (data as unknown as ChildMedical[] | null)?.[0] ?? null;
  },

  /**
   * A parent says what they know.
   *
   * The server derives the classroom label, writes a history row, tells the
   * Kids Ministry admins, and starts the re-signing clock — all in the one
   * transaction, so none of it can be half-done. The caller's job is only to
   * show what came back.
   */
  async updateChildMedical(v: {
    childPersonId: string;
    allergies?: string | null;
    allergySeverity?: AllergySeverity | null;
    medications?: string | null;
    medicalNotes?: string | null;
    specialNeeds?: string | null;
    noKnownConditions?: boolean;
  }): Promise<MedicalUpdateResult | null> {
    const { data, error } = await church().rpc("update_child_medical", {
      _child_person_id: v.childPersonId,
      _allergies: v.allergies ?? null,
      _allergy_severity: v.allergySeverity ?? null,
      _medications: v.medications ?? null,
      _medical_notes: v.medicalNotes ?? null,
      _special_needs: v.specialNeeds ?? null,
      _no_known_conditions: v.noKnownConditions ?? false,
    });
    throwRpc(error);
    return (data as unknown as MedicalUpdateResult[] | null)?.[0] ?? null;
  },
};
