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
};
