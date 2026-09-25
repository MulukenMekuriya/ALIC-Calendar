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

/** One child, as the desk sees them before check-in. */
export interface ScreenedChild {
  child_person_id: string;
  child_name: string;
  /** How the sheet is shown once per family rather than once per child. */
  household_id: string | null;
  state: ConsentStateValue;
  /** False ONLY when the policy is enforcing. In warn mode this is always true. */
  allow: boolean;
  refusal_code: string | null;
  enforcing: boolean;
  excepted: boolean;
  resign_due_by: string | null;
  policy_mode: "off" | "warn" | "block";
  enforce_from: string | null;
  notice_text: string | null;
}

/** What is already on file for a child. Reading this is audited server-side. */
export interface ConsentPrefill {
  child_person_id: string;
  child_name: string;
  has_record: boolean;
  allergy_severity: string | null;
  allergies: string | null;
  medications: string | null;
  special_needs: string | null;
}

export interface ConsentSigner {
  person_id: string;
  full_name: string;
  household_id: string;
  /** Whether a copy can actually be emailed. 10 of 216 households cannot. */
  has_email: boolean;
}

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

  /**
   * What the desk asks before it checks anybody in.
   *
   * A SEPARATE CALL, made before check_in_children rather than inside it.
   * Its answer drives what the screen says, not what the database does —
   * which is what lets the whole consent feature be visible and usable weeks
   * before anything can refuse anybody.
   */
  async screenChildren(
    childPersonIds: string[],
    kidsSessionId: string | null,
    shiftToken?: string | null,
  ): Promise<ScreenedChild[]> {
    if (childPersonIds.length === 0) return [];
    const { data, error } = await church().rpc("screen_children_for_check_in", {
      _child_person_ids: childPersonIds,
      _kids_session_id: kidsSessionId,
      _shift_token: shiftToken ?? null,
    });
    throwRpc(error);
    return (data ?? []) as unknown as ScreenedChild[];
  },

  /**
   * What is already on file, for section 4 of the sheet.
   *
   * Every call writes a sensitive_viewed audit row server-side, so this is
   * fetched when the sheet opens and not on a hover or a render.
   */
  async consentPrefill(
    childPersonIds: string[],
    shiftToken?: string | null,
  ): Promise<ConsentPrefill[]> {
    if (childPersonIds.length === 0) return [];
    const { data, error } = await church().rpc("station_child_consent_prefill", {
      _child_person_ids: childPersonIds,
      _shift_token: shiftToken ?? null,
    });
    throwRpc(error);
    return (data ?? []) as unknown as ConsentPrefill[];
  },

  /** Who may sign for this child. Picked, never typed. */
  async signers(
    childPersonId: string,
    shiftToken?: string | null,
  ): Promise<ConsentSigner[]> {
    const { data, error } = await church().rpc("station_consent_signers", {
      _child_person_id: childPersonId,
      _shift_token: shiftToken ?? null,
    });
    throwRpc(error);
    return (data ?? []) as unknown as ConsentSigner[];
  },

  async signAtStation(v: {
    householdId: string;
    childPersonIds: string[];
    signerPersonId: string;
    signerPrintedName: string;
    answers: Record<string, boolean>;
    perChildAnswers?: Record<string, Record<string, boolean>>;
    signerRelationship?: string | null;
    shiftToken?: string | null;
  }): Promise<{ signature_id: string; children_named: number } | null> {
    const { data, error } = await church().rpc("station_sign_consent", {
      _household_id: v.householdId,
      _child_person_ids: v.childPersonIds,
      _signer_person_id: v.signerPersonId,
      _signer_printed_name: v.signerPrintedName,
      _answers: v.answers,
      _per_child_answers: v.perChildAnswers ?? {},
      _signer_relationship: v.signerRelationship ?? null,
      _shift_token: v.shiftToken ?? null,
    });
    throwRpc(error);
    return (data as unknown as { signature_id: string; children_named: number }[] | null)?.[0] ?? null;
  },

  /** A leader letting one family through for one service. Not a waiver. */
  async grantException(v: {
    childPersonId: string;
    kidsSessionId: string;
    reason: string;
  }): Promise<string | null> {
    const { data, error } = await church().rpc("kids_grant_consent_exception", {
      _child_person_id: v.childPersonId,
      _kids_session_id: v.kidsSessionId,
      _reason: v.reason,
    });
    throwRpc(error);
    return (data as unknown as string) ?? null;
  },

  async setMode(v: {
    organizationId: string;
    mode: "off" | "warn" | "block";
    enforceFrom?: string | null;
    noticeText?: string | null;
  }): Promise<void> {
    const { error } = await church().rpc("set_kids_consent_mode", {
      _organization_id: v.organizationId,
      _mode: v.mode,
      _enforce_from: v.enforceFrom ?? null,
      _notice_text: v.noticeText ?? null,
    });
    throwRpc(error);
  },
};
