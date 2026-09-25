/**
 * The shape of the church's consent form, and the pure rules about it.
 *
 * The text itself lives in `church.consent_documents`, not here. That is the
 * whole point of the design: a signature freezes a version and a sha256, and
 * if the words lived in this bundle a routine redeploy would silently change
 * what a stored signature means. Nothing in this file contains form copy, and
 * nothing in this file should ever start to.
 *
 * What lives here is the reading of it — which sections a surface shows, and
 * whether a set of answers is complete enough to be a signature. Both are
 * pure, so both are testable without a database.
 */

/** How a section is rendered and what it collects. */
export type ConsentSectionKind =
  | "children"
  | "statement"
  | "acknowledgments"
  | "fields"
  | "choice"
  | "signature";

/** Where a section is shown. `both` is the default when absent. */
export type ConsentSurface = "kiosk" | "portal" | "both";

export interface ConsentOption {
  key: string;
  text: string;
}

export interface ConsentSection {
  key: string;
  heading: string;
  kind: ConsentSectionKind;
  surface?: ConsentSurface;
  text?: string | null;
  options?: ConsentOption[] | null;
}

export interface ConsentDocument {
  document_id: string;
  code: string;
  version: number;
  title: string;
  body: ConsentSection[];
  /**
   * Of the WHOLE document, never of a surface-filtered subset. A parent
   * signing at the kiosk is agreeing to the whole form — the kiosk shows
   * what can be completed standing at a queue, it does not narrow the
   * agreement — and the PDF prints all of it.
   */
  body_sha256: string;
  required_acknowledgments: string[];
  effective_from: string;
}

/**
 * The sections one surface shows.
 *
 * The server filters this too, in `church.current_consent_document`. Doing it
 * again here is not redundancy for its own sake: the portal fetches the full
 * document to render a signed history and a "download my copy", and then
 * needs to show a parent which parts they answered at the desk.
 */
export function sectionsForSurface(
  body: ConsentSection[],
  surface: Exclude<ConsentSurface, "both">,
): ConsentSection[] {
  return body.filter((s) => (s.surface ?? "both") === "both" || s.surface === surface);
}

/** Every option key the document offers, across all sections. */
export function allOptionKeys(body: ConsentSection[]): string[] {
  return body.flatMap((s) => (s.options ?? []).map((o) => o.key));
}

/**
 * Which required acknowledgments are still unticked.
 *
 * Returns the keys rather than a boolean so the signing screen can scroll to
 * the first one and say which it is. "Something on this form is incomplete"
 * is the message that makes a parent hand the tablet back to a volunteer.
 *
 * The server checks this again at signing time and is the authority; this is
 * here so a parent finds out before they submit, not after.
 */
export function missingAcknowledgments(
  required: string[],
  ticked: Iterable<string>,
): string[] {
  const have = new Set(ticked);
  return required.filter((key) => !have.has(key));
}

/**
 * Where a required key lives, so a screen can say "Section 3" rather than
 * naming an internal key at a parent.
 */
export function sectionForOption(
  body: ConsentSection[],
  optionKey: string,
): ConsentSection | null {
  return body.find((s) => (s.options ?? []).some((o) => o.key === optionKey)) ?? null;
}

/**
 * A required key that names no option in the document can never be ticked, so
 * every signature would be refused with nothing on screen explaining why.
 *
 * `publish_consent_document` refuses to store such a document, so this should
 * always be empty against a real one. It is here because "impossible" and
 * "worth failing loudly on" are not the same thing, and a form nobody can
 * complete is a Sunday morning with a queue and no way forward.
 */
export function unsatisfiableRequirements(doc: ConsentDocument): string[] {
  const offered = new Set(allOptionKeys(doc.body));
  return doc.required_acknowledgments.filter((k) => !offered.has(k));
}

/**
 * Sections that ask something of a parent per child rather than per family.
 *
 * Photo consent is the one that matters today: `photo_consent` is a per-child
 * column, and one household answer applied to N children overwrites real
 * differences between them.
 */
export const PER_CHILD_SECTION_KEYS = ["photo_video"] as const;

export function isPerChild(section: ConsentSection): boolean {
  return (PER_CHILD_SECTION_KEYS as readonly string[]).includes(section.key);
}
