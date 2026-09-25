/**
 * Renders the stored PDF of a signed consent form, and of an injury or
 * safeguarding incident report.
 *
 * Drains a queue rather than taking an id: church.consent_pdfs_pending()
 * returns rows with no PDF yet, so a lost nudge costs a few minutes rather
 * than a missing document, and the cron backstop is the same call.
 *
 * ---------------------------------------------------------------------------
 * THE ONE THING THAT MAKES THIS WORTH DOING SERVER-SIDE
 * ---------------------------------------------------------------------------
 *
 * REGENERABLE HAS TO MEAN REGENERABLE IDENTICALLY. A signature is only
 * evidence if you can say which words were agreed to, and the stored hash of
 * the document is how. That falls apart the moment the bytes depend on
 * anything other than frozen rows.
 *
 * So: EVERY DATE ON THE PAGE COMES FROM A COLUMN. There is no `new Date()`
 * anywhere in the layout, and both PDF metadata dates are set explicitly from
 * signed_at. Left alone, every PDF library stamps CreationDate and ModDate
 * from the system clock, so two renders of the same signature would differ in
 * bytes and therefore in hash — which would turn "the hash does not match"
 * from a real alarm into noise everybody learns to ignore.
 *
 * pdf-lib rather than jsPDF because jsPDF reaches for `window` and `document`
 * on several paths under Deno. Not html2canvas: a rasterised form is
 * unsearchable, unselectable, and about forty times the size.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT MUST NOT DO
 * ---------------------------------------------------------------------------
 *
 * It must not look anything up for itself. The payload RPCs return frozen
 * columns — the child's name as it was at signing, the document body at the
 * version that was signed — and a renderer that joined to live tables would
 * quietly undo the whole point. If a field is not in the payload, it does not
 * belong on the page.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/** Per invocation, to stay inside the edge function's time limit. */
const BATCH_SIZE = 10;

const CONSENT_BUCKET = "kids-consent-forms";
const INCIDENT_BUCKET = "kids-incident-reports";

/** US Letter, which is what the church's paper form is printed on. */
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 54;
const CONTENT_W = PAGE_W - MARGIN * 2;

/**
 * Fixed metadata strings. Anything here that varied between runs would change
 * the bytes, so none of it is derived from the environment or the clock.
 */
const PRODUCER = "ALIC Church Records";
const CREATOR = "render-consent-pdf/1";

interface PendingRow {
  kind: "consent" | "incident";
  id: string;
  organization_id: string;
  household_id: string | null;
  at: string;
}

// ---------------------------------------------------------------------------
// Dates, from columns only
// ---------------------------------------------------------------------------

/**
 * A timestamp as the page prints it.
 *
 * Fixed to en-US and the church's own timezone rather than the runtime's, so
 * the same row renders the same string on any machine. An edge function that
 * moved region would otherwise change the bytes of every document it touched.
 */
function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/**
 * pdf-lib draws a string at a point; it does not wrap. WinAnsi also cannot
 * encode every character a parent might type, and an unencodable one throws
 * mid-render — which would fail the whole document over a smart quote. Both
 * are handled here rather than at forty call sites.
 */
function sanitize(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    // Every space-like character ICU can emit, flattened to a plain space.
    // U+202F is the one that bites: Intl.DateTimeFormat puts a NARROW NO-BREAK
    // SPACE between the time and AM/PM, WinAnsi cannot encode it, and it came
    // out of the first real render as "3:50?PM" on a legal document.
    .replace(/[\u00A0\u2007\u2009\u202F\u2060]/g, " ")
    // Anything still outside WinAnsi becomes a question mark rather than an
    // exception. A document with one odd glyph is recoverable; a document
    // that does not exist is not.
    .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, "?");
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const paragraph of sanitize(text).split("\n")) {
    if (paragraph.trim() === "") {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        line = candidate;
      } else {
        if (line) out.push(line);
        line = word;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

interface Fonts {
  body: PDFFont;
  bold: PDFFont;
}

/** A cursor that starts a new page when it runs off the bottom. */
class Cursor {
  page: PDFPage;
  y: number;
  private pages: PDFPage[] = [];

  constructor(private doc: PDFDocument, private fonts: Fonts) {
    this.page = doc.addPage([PAGE_W, PAGE_H]);
    this.pages.push(this.page);
    this.y = PAGE_H - MARGIN;
  }

  allPages(): PDFPage[] {
    return this.pages;
  }

  private ensure(height: number) {
    if (this.y - height >= MARGIN + 36) return;
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.pages.push(this.page);
    this.y = PAGE_H - MARGIN;
  }

  gap(h: number) {
    this.ensure(h);
    this.y -= h;
  }

  text(
    value: string,
    opts: { size?: number; bold?: boolean; indent?: number; color?: number } = {},
  ) {
    const size = opts.size ?? 10;
    const font = opts.bold ? this.fonts.bold : this.fonts.body;
    const indent = opts.indent ?? 0;
    const lines = wrap(value, font, size, CONTENT_W - indent);
    const lineHeight = size * 1.35;
    for (const line of lines) {
      this.ensure(lineHeight);
      this.y -= lineHeight;
      if (line === "") continue;
      this.page.drawText(line, {
        x: MARGIN + indent,
        y: this.y,
        size,
        font,
        color: rgb(opts.color ?? 0, opts.color ?? 0, opts.color ?? 0),
      });
    }
  }

  heading(value: string) {
    this.gap(8);
    this.text(value, { size: 11.5, bold: true });
    this.gap(2);
  }

  rule() {
    this.ensure(10);
    this.y -= 6;
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE_W - MARGIN, y: this.y },
      thickness: 0.6,
      color: rgb(0.7, 0.7, 0.7),
    });
    this.y -= 6;
  }

  /** A ticked or unticked box, so an acknowledgment reads as answered. */
  checkbox(ticked: boolean, label: string) {
    const size = 9.5;
    const lines = wrap(label, this.fonts.body, size, CONTENT_W - 18);
    const lineHeight = size * 1.35;
    this.ensure(lineHeight);
    this.y -= lineHeight;
    this.page.drawRectangle({
      x: MARGIN,
      y: this.y - 1,
      width: 8.5,
      height: 8.5,
      borderWidth: 0.8,
      borderColor: rgb(0.2, 0.2, 0.2),
    });
    if (ticked) {
      this.page.drawText("X", {
        x: MARGIN + 1.8,
        y: this.y + 0.6,
        size: 8,
        font: this.fonts.bold,
        color: rgb(0, 0, 0),
      });
    }
    if (lines[0]) {
      this.page.drawText(lines[0], {
        x: MARGIN + 16,
        y: this.y,
        size,
        font: this.fonts.body,
      });
    }
    for (const line of lines.slice(1)) {
      this.ensure(lineHeight);
      this.y -= lineHeight;
      this.page.drawText(line, { x: MARGIN + 16, y: this.y, size, font: this.fonts.body });
    }
  }
}

function footer(pages: PDFPage[], fonts: Fonts, left: string, right: string) {
  pages.forEach((page, i) => {
    page.drawText(sanitize(left), {
      x: MARGIN,
      y: MARGIN - 18,
      size: 7.5,
      font: fonts.body,
      color: rgb(0.45, 0.45, 0.45),
    });
    const label = `${right}  ·  Page ${i + 1} of ${pages.length}`;
    const w = fonts.body.widthOfTextAtSize(sanitize(label), 7.5);
    page.drawText(sanitize(label), {
      x: PAGE_W - MARGIN - w,
      y: MARGIN - 18,
      size: 7.5,
      font: fonts.body,
      color: rgb(0.45, 0.45, 0.45),
    });
  });
}

// ---------------------------------------------------------------------------
// The consent form
// ---------------------------------------------------------------------------

function isTicked(answers: Record<string, unknown>, key: string): boolean {
  const v = answers?.[key];
  return v === true || v === "true" || v === "yes" || v === "on";
}

async function renderConsent(payload: any): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonts: Fonts = {
    body: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };

  const signedAt: string = payload.signer?.signed_at;
  const answers: Record<string, unknown> = payload.answers ?? {};
  const children: any[] = payload.children ?? [];

  const c = new Cursor(doc, fonts);

  c.text(payload.church_name ?? "ALIC Church", { size: 15, bold: true });
  c.text("Children's & Youth Ministry", { size: 10 });
  c.gap(6);
  c.text(payload.document?.title ?? "Parent / Guardian Consent", {
    size: 12.5,
    bold: true,
  });
  c.rule();

  // ---- Who signed, and how -------------------------------------------------
  //
  // THE PDF SAYS WHICH METHOD WAS USED, and that is not decoration. A kiosk
  // signature is materially weaker evidence than a portal one — the parent is
  // not authenticated — and a document that hid the difference is the one
  // that fails in a dispute.
  c.heading("Signature");
  c.text(`Signed by: ${payload.signer?.printed_name ?? "—"}`, { bold: true });
  if (payload.signer?.relationship) {
    c.text(`Relationship to the children: ${payload.signer.relationship}`);
  }
  c.text(`Date and time: ${fmtDateTime(signedAt)}`);

  if (payload.signer?.source === "portal") {
    c.text(
      `Signed in My Church, by the account ${
        payload.signer?.authenticated_email ?? "(not recorded)"
      }.`,
    );
  } else {
    const witness = payload.signer?.witness_name;
    c.text(
      witness
        ? `Signed at the Welcome Desk, witnessed by ${witness}.`
        : `Signed at a Kids Ministry check-in station${
            payload.signer?.station_id ? ` (device ${payload.signer.station_id})` : ""
          }.`,
    );
  }

  if (payload.secondary) {
    c.text(
      `Second parent or guardian: ${payload.secondary.printed_name} — ${fmtDateTime(
        payload.secondary.signed_at,
      )}`,
    );
  }

  // The association between signature and record, in a form somebody can
  // check. This line is what document_sha256 exists for.
  c.gap(4);
  c.text(
    `This signature is recorded against version ${payload.document?.version} of the ` +
      `form, whose text has the fingerprint ${payload.document?.sha256}.`,
    { size: 8, color: 0.4 },
  );

  // ---- The children --------------------------------------------------------
  c.heading("1. Children and youth covered by this form");
  if (children.length === 0) {
    c.text("None recorded.");
  }
  for (const child of children) {
    const bits = [child.grade, child.dob ? `born ${child.dob}` : null].filter(Boolean);
    c.text(`${child.name}${bits.length ? ` — ${bits.join(", ")}` : ""}`, { bold: true });
    const perChild = (child.answers ?? {}) as Record<string, unknown>;
    if (isTicked(perChild, "photo_declined")) {
      c.text("Photographs and video: not permitted for this child.", { indent: 12 });
    } else if (isTicked(perChild, "photo_permitted")) {
      c.text("Photographs and video: permitted.", { indent: 12 });
    }
  }

  // ---- The document, as it was signed --------------------------------------
  //
  // The body comes from the version this signature froze, not from whatever
  // is current. That is the entire reason the document is versioned.
  const body: any[] = Array.isArray(payload.document?.body) ? payload.document.body : [];
  for (const section of body) {
    if (section.key === "child_information") continue; // printed above
    c.heading(section.heading ?? "");
    if (section.text) c.text(section.text, { size: 9.5 });
    const options: any[] = Array.isArray(section.options) ? section.options : [];
    if (options.length) c.gap(3);
    for (const option of options) {
      c.checkbox(isTicked(answers, option.key), option.text ?? option.key);
    }
  }

  // ---- The Ministry Use Only block -----------------------------------------
  //
  // Printed BLANK, always. The review is recorded in the database and is
  // never re-rendered into the stored document: mutating a signed document
  // after signing is exactly what this design exists to prevent, and a PDF
  // that grew a new line each time somebody looked at it would be worthless
  // as evidence.
  c.gap(10);
  c.rule();
  c.text("ALIC Ministry Use Only", { bold: true, size: 9.5 });
  c.text(`Date received: ${fmtDateTime(signedAt)}`, { size: 9 });
  c.text("Reviewed by: ______________________________", { size: 9 });

  footer(
    c.allPages(),
    fonts,
    `${payload.church_name ?? "ALIC Church"} — Parent/Guardian Consent & Safety Acknowledgment`,
    `Signed ${fmtDate(String(signedAt).slice(0, 10))}`,
  );

  // Metadata, fixed. See the header: left to itself every PDF library stamps
  // these from the system clock and two renders of one signature would
  // differ in bytes.
  const stamp = new Date(signedAt);
  doc.setTitle(`${payload.document?.title ?? "Consent"} — ${payload.signer?.printed_name ?? ""}`);
  doc.setAuthor(payload.church_name ?? "ALIC Church");
  doc.setSubject(`Consent form version ${payload.document?.version}`);
  doc.setProducer(PRODUCER);
  doc.setCreator(CREATOR);
  doc.setCreationDate(stamp);
  doc.setModificationDate(stamp);

  return await doc.save();
}

// ---------------------------------------------------------------------------
// The incident report
// ---------------------------------------------------------------------------

async function renderIncident(payload: any): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonts: Fonts = {
    body: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };

  const c = new Cursor(doc, fonts);
  const reportedAt: string = payload.reported_at;

  c.text(payload.church_name ?? "ALIC Church", { size: 15, bold: true });
  c.text("Children's & Youth Ministry", { size: 10 });
  c.gap(6);
  c.text(
    payload.severity === "injury" ? "Injury Report" : "Safeguarding Record",
    { size: 12.5, bold: true },
  );
  c.rule();

  c.text(`Child: ${payload.child_name ?? "—"}`, { bold: true });
  c.text(`Date: ${fmtDate(payload.occurred_on)}`);
  c.text(`Classroom: ${payload.room_name ?? "—"}`);

  // ---- The teacher's account, visibly quoted -------------------------------
  //
  // Immutable since submission and printed as written. A teacher may be asked
  // in a year what they saw, and the answer has to be what they wrote rather
  // than what somebody tidied.
  c.heading("What was reported at the time");
  c.text(
    `Written by ${payload.reported_by_name ?? "a teacher"} on ${fmtDateTime(reportedAt)}.`,
    { size: 9, color: 0.35 },
  );
  c.gap(3);
  c.text(payload.reported_narrative ?? "—", { size: 10, indent: 12 });

  if (payload.admin_summary) {
    // The admin's own words, kept separate. They never overwrite the account
    // above; they sit beside it.
    c.heading("Reviewed by the Kids Ministry");
    c.text(payload.admin_summary, { size: 10, indent: 12 });
  }

  if (payload.signed_off_by_name) {
    c.gap(6);
    c.text(
      `Signed off by ${payload.signed_off_by_name} on ${fmtDateTime(payload.signed_off_at)}.`,
      { size: 9.5 },
    );
  }

  // ---- The reporting question ----------------------------------------------
  //
  // Recorded, never performed. The software does not report on anybody's
  // behalf and must not read as though it did; what it shows is whether a
  // human did, so the church can demonstrate it took the concern seriously.
  if (payload.severity === "safeguarding") {
    c.heading("Reporting to the authorities");
    if (payload.external_report_made === true) {
      c.text(
        `Reported to the authorities on ${fmtDateTime(payload.external_reported_at)}` +
          (payload.external_report_reference
            ? `, reference ${payload.external_report_reference}.`
            : "."),
      );
    } else if (payload.external_report_made === false) {
      c.text("Not reported to the authorities. The reason is recorded with this report.");
    } else {
      c.text("No answer recorded.", { bold: true });
    }
  }

  footer(
    c.allPages(),
    fonts,
    `${payload.church_name ?? "ALIC Church"} — ${
      payload.severity === "injury" ? "Injury report" : "Safeguarding record"
    }`,
    `Reported ${fmtDate(payload.occurred_on)}`,
  );

  const stamp = new Date(reportedAt);
  doc.setTitle(`Incident report — ${payload.child_name ?? ""}`);
  doc.setAuthor(payload.church_name ?? "ALIC Church");
  doc.setSubject(payload.severity ?? "incident");
  doc.setProducer(PRODUCER);
  doc.setCreator(CREATOR);
  doc.setCreationDate(stamp);
  doc.setModificationDate(stamp);

  return await doc.save();
}

// ---------------------------------------------------------------------------

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // .slice().buffer, not the Uint8Array: a view's buffer may be a
  // SharedArrayBuffer as far as the types are concerned, and digest() only
  // accepts an ArrayBuffer. The copy is over identical bytes, so the hash is
  // unchanged - which matters, because these hashes are already stored.
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { db: { schema: "church" } },
  );

  const { data: pending, error: queueError } = await supabase.rpc("consent_pdfs_pending", {
    _limit: BATCH_SIZE,
  });

  if (queueError) {
    console.error("could not read the render queue", queueError);
    return new Response(JSON.stringify({ error: queueError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rows = (pending ?? []) as PendingRow[];
  let rendered = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      if (row.kind === "consent") {
        const { data: payload, error } = await supabase.rpc("consent_pdf_payload", {
          _signature_id: row.id,
        });
        if (error) throw error;
        if (!payload) throw new Error("no payload");

        const bytes = await renderConsent(payload);
        const path = `${row.organization_id}/${row.household_id ?? "no-household"}/${row.id}.pdf`;

        const { error: upErr } = await supabase.storage
          .from(CONSENT_BUCKET)
          // upsert, so a retry after a partial failure replaces rather than
          // colliding. The path is derived from the signature id, so it can
          // only ever overwrite this signature's own bytes.
          .upload(path, bytes, { contentType: "application/pdf", upsert: true });
        if (upErr) throw upErr;

        const { error: recErr } = await supabase.rpc("record_consent_pdf", {
          _signature_id: row.id,
          _storage_path: path,
          _sha256: await sha256Hex(bytes),
          _bytes: bytes.length,
        });
        if (recErr) throw recErr;
      } else {
        const { data: payload, error } = await supabase.rpc("incident_pdf_payload", {
          _incident_id: row.id,
        });
        if (error) throw error;
        if (!payload) throw new Error("no payload");

        const bytes = await renderIncident(payload);
        const path = `${row.organization_id}/${row.id}.pdf`;

        const { error: upErr } = await supabase.storage
          .from(INCIDENT_BUCKET)
          .upload(path, bytes, { contentType: "application/pdf", upsert: true });
        if (upErr) throw upErr;

        const { error: recErr } = await supabase.rpc("record_incident_pdf", {
          _incident_id: row.id,
          _storage_path: path,
          _sha256: await sha256Hex(bytes),
        });
        if (recErr) throw recErr;
      }
      rendered++;
    } catch (err) {
      // One bad row must not stop the batch, and the reason is written to the
      // row rather than only to a log nobody reads. After five attempts the
      // queue stops offering it, and pdf_error says why it is still there.
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`render failed for ${row.kind} ${row.id}: ${message}`);
      if (row.kind === "consent") {
        await supabase.rpc("record_consent_pdf", {
          _signature_id: row.id,
          _storage_path: null,
          _sha256: null,
          _bytes: null,
          _error: message.slice(0, 500),
        });
      } else {
        await supabase.rpc("record_incident_pdf", {
          _incident_id: row.id,
          _storage_path: null,
          _sha256: null,
          _error: message.slice(0, 500),
        });
      }
    }
  }

  return new Response(JSON.stringify({ rendered, failed, considered: rows.length }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
