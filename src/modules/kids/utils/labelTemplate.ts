/**
 * Thermal label markup.
 *
 * Pure: builds an HTML document as a string. Printing it is a separate,
 * impure concern (see labelPrintService), so the layout can be unit-tested.
 *
 * TWO LABELS PER FAMILY:
 *
 *   CHILD label  — name, classroom, guardian and phone, and the pickup code.
 *   PARENT label — the pickup code and its QR.
 *
 * BOTH NOW CARRY THE SAME CODE. That is a deliberate reversal by the ministry
 * lead, and it removes a property the original design had: the child used to
 * wear a tag NUMBER while the parent held a separate code, so seeing a child
 * told you nothing about how to release them. It now does.
 *
 * What still stands in the way is at the desk, not on the label: check_out
 * refuses to release a child with a restriction on file unless the collector is
 * named, the volunteer records who is collecting, and every attempt is audited.
 * The code is a matching key now, not a secret from anyone in the room.
 *
 * The parent label still carries no classroom and no medical information, per
 * KID-010 — a slip dropped in a car park must not say where a named child is
 * sitting. The child's own tag necessarily does, because it is worn in that
 * classroom by that child.
 *
 * LANDSCAPE. The card is WIDER THAN IT IS TALL, which is the shape the ministry
 * asked for after seeing the portrait version: it is the shape every other
 * church check-in tag is, it is the shape that fits a lanyard sleeve, and a tall
 * narrow tag on a small child's chest runs off the bottom of the shirt.
 *
 * The media cannot supply that shape directly. A DK-1202 label is 62 x 100mm
 * and comes off the roll SHORT EDGE FIRST, so in the printer's own coordinates
 * it is a portrait page and 62mm is a hard ceiling across it. The card is
 * therefore drawn landscape and rotated a quarter turn onto the label. See
 * LABEL_CSS for the arithmetic. The page stays 62 x 100mm, which is exactly
 * what the Brother driver reports for this die-cut, so nothing is scaled to fit
 * and a millimetre on screen is a millimetre on the label.
 *
 * The layout follows the standard church check-in tag: name dominant, details
 * beneath a rule, guardian at the foot, and a black tab down the right edge
 * carrying the pickup code. The tab is there because a worn tag gets folded and
 * curled — the flat face stops being readable, and the edge does not.
 *
 * Direct thermal printing is monochrome, so nothing may depend on colour —
 * the allergy warning is a solid black bar with knockout white text.
 */

export interface ChildLabelData {
  childName: string;
  roomName: string | null;
  /**
   * Printed on the detail line as "Tag 1000".
   *
   * It is how the LIVE BOARD lists children, and the board is the only route
   * from a tag in a volunteer's hand to a row on a screen. The pickup code
   * cannot serve that purpose: it is stored only as an HMAC in a vault table
   * that grants SELECT to nobody, so no list can ever display it. Take this
   * off the tag and the route closes — which is exactly what happened when it
   * was briefly dropped for the time.
   */
  tagNumber: number;
  /** Printed down the edge tab. Same code as the parent slip — see the note above. */
  pickupCode: string;
  allergyLabel: string | null;
  isFirstTime?: boolean;
  serviceLabel: string;
  sessionDate: string;
  /**
   * Wall-clock time the label was printed, e.g. "10:32 AM", preformatted like
   * sessionDate. At check-in this IS the check-in time; on a reprint it is the
   * reprint's. Added at the ministry's request — a volunteer looking at a tag
   * wants to know how long the child has been in the room, which the tag
   * number never told them. It sits BESIDE the tag number rather than in place
   * of it; see tagNumber for why that one cannot leave.
   */
  checkInTime?: string;
  /**
   * The adult to ask for, printed at the foot at the LEFT end of the phone
   * number — so the two read as one fact: this name, on this number.
   *
   * The caller decides who that is, most specific first: the person the desk
   * recorded under "who is dropping off?", and failing that the household, so
   * the number is never left sitting on the tag unattributed. It is NOT a
   * claim about who is in the building — the desk allows checking in without
   * naming anyone, and check_out is what actually controls release.
   */
  guardianName?: string | null;
  /** A dialable number: the volunteer holding a crying child has to call it. */
  guardianPhone?: string | null;
}

export interface ParentLabelData {
  householdName: string;
  childCount: number;
  pickupCode: string;
  /** Inline SVG for the QR, or null when QR generation is unavailable. */
  qrSvg: string | null;
  serviceLabel: string;
  sessionDate: string;
  /** Off by default: a dropped label should not name the children. */
  childNames?: string[];
}

/** Escape for HTML interpolation. A name containing & or < must not break the label. */
function esc(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * The printed page, in millimetres, and the landscape card drawn on it.
 *
 * 62 x 100mm is the DK-1202 die-cut, and BOTH numbers are fixed. That is the
 * one thing that changed the design when the desk settled on this media over
 * the continuous DK-2205 roll: on continuous stock the label length was ours to
 * choose and a shorter label was cheaper, so the length was derived from the
 * tallest thing the template could build. Die-cut removes the choice. Every
 * label is 100mm whether the ink reaches the end or not, so the only question
 * left is whether the design USES the 100mm — and a landscape card does,
 * where the portrait one left 15mm blank.
 *
 * The CARD is 96 x 58mm: the page less a 2mm gutter on all four sides, turned a
 * quarter turn (see LABEL_CSS). That is a 1.66:1 card, which is within a
 * millimetre of the 4 x 2.25 inch stock the rest of the industry prints
 * check-in tags on — and of the reference tag the ministry handed over.
 */
export const LABEL_PAGE_MM = { width: 62, length: 100 } as const;
export const LABEL_CARD_MM = { width: 96, height: 58 } as const;

/**
 * The unprintable border, on every side.
 *
 * Brother's own margin on this die-cut is 1.5mm, so 2mm leaves half a
 * millimetre — about 6 dots at 300dpi — of genuine clearance. It is also what
 * relates the page to the card: the card is the page less this gutter twice,
 * on both axes, and the rotation offset below is the page width less it once.
 * Stating it once is what stops those three drifting apart.
 */
const GUTTER_MM = 2;

/**
 * Page and label CSS for a Brother QL-820NWB on DK-1202 (62 x 100mm die-cut).
 *
 * DIRECT THERMAL, which constrains the design more than anything else:
 *
 *   * There is no grey. The head either burns a dot or it does not, so a grey
 *     is dithered into a muddy stipple that looks like a printing fault at arm's
 *     length. Everything here is pure #000 on #fff.
 *   * There is no colour, so nothing may DEPEND on colour. The allergy warning
 *     is a solid black bar with knocked-out white text — it reads as an alarm
 *     even to someone glancing across a room.
 *   * Hairlines below about 0.3mm drop out unevenly at 300dpi. Rules are 0.5mm.
 *   * The die-cut edge is registered by a sensor, not by a blade, so it is
 *     tighter than the continuous roll's cutter was — but the unprintable
 *     border is real and nothing important sits within 3mm of an edge.
 *
 * THE PRINTABLE WINDOW, from Brother's Raster Command Reference for the
 * QL-800/810W/820NWB rather than from guesswork. For DK-1202 die-cut:
 *
 *   label                62.0 x 100.0mm
 *   printable area       58.9 x  97.0mm    696 x 1146 dots at 300dpi
 *   margin, each side     1.5mm             18 dots
 *   margin, each end      1.5mm
 *   pin layout           12 | 696 | 12  of the head's 720 pins
 *
 * The head is 60.96mm, NARROWER than the label, which is where 1.5mm rather
 * than 2mm comes from. 58.9mm is a hard ceiling: the printer's high-resolution
 * mode doubles resolution along the FEED direction only, never across.
 *
 * THAT CEILING IS THE WHOLE REASON FOR THE ROTATION. A landscape card needs its
 * long edge to be the long one, and the label's long axis is the feed. So the
 * card is laid out 96mm wide by 58mm tall in ordinary document coordinates —
 * where it can be read, edited and tested like any other layout — and then
 * turned a quarter turn onto the label:
 *
 *   .label starts at the page origin, 96 x 58mm.
 *   rotate(90deg) about that origin maps (x, y) to (-y, x),
 *     so the box lands at x in [-58, 0], y in [0, 96].
 *   translate(60mm, 2mm) slides it to x in [2, 60], y in [2, 98].
 *
 * which is the 62 x 100mm page inset by the 2mm gutter on every side. The ink
 * therefore spans 2.0 to 60.0mm across the label, inside Brother's 1.5 to
 * 60.5mm window, and 2.0 to 98.0mm along it, inside 1.5 to 98.5mm. Half a
 * millimetre — about 6 dots — clear on every edge.
 *
 * The transform runs right to left, so rotate happens first and translate
 * second; swapping them puts the card off the label entirely.
 *
 * The gutters are fixed rather than `margin: 0 auto` because auto-centring
 * split the remainder across whole device pixels and landed 1.75mm from one
 * edge and 2.31mm from the other. That put one border 0.23mm inside Brother's
 * boundary, on a rounding that is not stable across Chrome versions or scale
 * factors. Explicit offsets remove the rounding entirely.
 *
 * A transform does not affect layout, so .label still occupies 96mm of width in
 * the flow inside a 62mm page. That overhang is invisible — .page clips it — and
 * it is why .page carries overflow: hidden rather than .label alone. Laying the
 * card out at its true size and moving only the paint is what keeps the design
 * measurable: every dimension below is the dimension that reaches the label.
 *
 * THE PAPER SIZE IS DECLARED HERE AND NOWHERE ELSE. @page is the only thing a
 * web page can say about paper; which media the driver actually feeds is the
 * printer's default, and no stylesheet can reach it. So the failure that
 * matters is a desk whose Brother is still defaulting to A4 or Letter, and it
 * was worth measuring rather than assuming. Printed onto Letter and onto A4
 * with the CSS page size deliberately overridden, the card still comes out
 * 58.2 x 96.3mm — the same to a tenth of a millimetre as on the die-cut — just
 * centred on a wasted sheet. Chrome lays the page out at the size @page asks
 * for and does NOT stretch it to fill the paper.
 *
 * That makes a misconfigured desk expensive and obvious rather than dangerous:
 * a volunteer sees A4 sheets coming out, not a subtly rescaled tag with an
 * allergy bar that no longer reads at arm's length.
 */
export const LABEL_CSS = `
  @page { size: ${LABEL_PAGE_MM.width}mm ${LABEL_PAGE_MM.length}mm; margin: 0; }

  html, body {
    margin: 0; padding: 0; background: #fff;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  body {
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    color: #000;
    /* Kerning and ligatures cost legibility at 300dpi on thermal stock. */
    font-kerning: none; font-variant-ligatures: none;
    -webkit-font-smoothing: none;
  }

  /* One DK-1202 die-cut. Fixed size, because the die-cut is, and clipping —
     see the overhang note above. */
  .page {
    width: ${LABEL_PAGE_MM.width}mm; height: ${LABEL_PAGE_MM.length}mm;
    overflow: hidden;
    page-break-after: always;
    break-after: page;
  }
  .page:last-child { page-break-after: auto; break-after: auto; }

  .label {
    /* The card, in reading orientation. Turned onto the label by the transform;
       everything below is measured in this frame. */
    width: ${LABEL_CARD_MM.width}mm; height: ${LABEL_CARD_MM.height}mm;
    transform-origin: 0 0;
    transform: translate(${LABEL_PAGE_MM.width - GUTTER_MM}mm, ${GUTTER_MM}mm) rotate(90deg);
    /* The backstop. Content is bounded, but a machine that substitutes a font
       with different metrics could still overflow — and overflow here means the
       label paginates, so the desk hands out one label cut in half and one
       nearly blank. Clipping a millimetre is the lesser failure. */
    overflow: hidden;
    /* The reference's outlined card, 2mm inside the die-cut edge so the
       registration tolerance never eats the line. */
    border: 0.5mm solid #000; border-radius: 2mm;
    padding: 2.5mm;
    box-sizing: border-box;
    /* Face and edge tab side by side, the full height of the card. The tab is
       fixed width; the face takes whatever is left, and min-width: 0 lets a
       long name wrap inside it rather than pushing the tab off the card. */
    display: flex; flex-direction: row; align-items: stretch; gap: 2mm;
  }

  /* ---- child label ---- */

  .face { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  /* Every row keeps its natural height. A fixed-height flex COLUMN shrinks its
     children to fit by default, and the thing at the bottom of this one is the
     ALLERGY BAR: without this the bar silently loses its second line and prints
     as a black stripe with the text sheared off. Better to let the card's own
     overflow guard clip, which is visible, than to squash the alarm quietly. */
  .face > * { flex: 0 0 auto; }

  .name {
    font-size: 28pt; font-weight: 800; line-height: 1.06;
    word-break: break-word; hyphens: none;
  }
  /* Long names shrink rather than running off the edge. */
  .name.long { font-size: 21pt; }
  .name.verylong { font-size: 15pt; }

  /* Three of these now — under the name, under the details, above the adult —
     so their margins are worth a third of a millimetre each. Tightened when
     the third rule pushed the worst case past the card. */
  .rule { border-top: 0.5mm solid #000; margin: 0.8mm 0 0.6mm; }

  /* Classroom and the first-time flag share a line. The classroom is read by a
     volunteer walking a child down a corridor, so it is the largest thing after
     the name, and it wraps rather than truncating: "Redeemed A" ellipsised to
     "Redee…" defeats the whole reason the tag was picked up. */
  .metarow { display: flex; align-items: baseline; justify-content: space-between; gap: 2mm; }
  /* Shrinks in tiers rather than wrapping. A second classroom line is the one
     row this card cannot afford — see roomClass(). */
  .room { font-size: 15pt; font-weight: 800; line-height: 1.15; min-width: 0; }
  .room.long { font-size: 12pt; }
  .room.verylong { font-size: 9.5pt; }
  .room.tiny { font-size: 8pt; }
  .when { font-size: 8.5pt; margin-top: 0.2mm; }
  .when.long { font-size: 7.5pt; }
  .when.verylong { font-size: 6.5pt; }

  /* The rule that CLOSES the child's details, and the one that splits the card
     into a top group and a bottom group. Its margin-bottom: auto eats all the
     free space, so the allergy bar and the guardian hang off the FOOT no
     matter which of them are present — a child with an allergy and no named
     adult used to leave the black bar stranded mid-card.
     The auto margin lives here rather than on .when because a rule after an
     auto margin would be pushed to the bottom with everything else, and this
     one belongs directly under the detail line. */
  .rule.split { margin-bottom: auto; }

  /* First time is a chip on the classroom line, not a block of its own: the
     landscape card has width to spare and height to spare only when the name
     is short, so nothing optional is allowed to cost a row. */
  .firsttime {
    font-size: 8pt; font-weight: 800; white-space: nowrap; flex: 0 0 auto;
    border: 0.4mm solid #000; border-radius: 1mm; padding: 0.6mm 1.4mm;
  }

  /* Guardian at the foot, hung there by .when's auto margin above. Name and
     number sit side by side now — in portrait they were fighting for 40mm and
     "Dawit Bekele" truncated to "Dawit Bek…"; across 77mm they both fit whole.
     The number is the larger of the two: someone reads it aloud while holding
     a crying child. */
  .guardian {
    display: flex; align-items: baseline; gap: 2mm;
    font-size: 8.5pt; line-height: 1.25;
  }
  .guardian .gname {
    font-weight: 700; min-width: 0;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  /* margin-left: auto, NOT justify-content: space-between on the row. The desk
     is allowed to record nobody, and space-between puts a LONE child at the
     start — so every tag without a named adult printed its phone number hard
     against the left edge. An auto margin pushes the number right whether or
     not there is a name beside it. */
  .guardian .gphone {
    margin-left: auto;
    font-size: 11pt; font-weight: 700; white-space: nowrap; flex: 0 0 auto;
  }

  /* The edge tab: solid black, knockout, running down the right-hand side.
     A worn tag curls and the flat face stops being readable; the edge does not. */
  .tab {
    width: 11mm; flex: 0 0 11mm;
    background: #000; color: #fff; border-radius: 1.5mm;
    display: flex; flex-direction: column;
    align-items: center; justify-content: space-between;
    padding: 1.5mm 0; box-sizing: border-box;
  }
  .tab .tabword { font-size: 7pt; font-weight: 800; letter-spacing: 0.3mm; }
  /* Stacked upright, so it reads without turning the label sideways.
     Monospaced to match the parent slip: the two get held side by side at the
     door, and a code has to be comparable at a glance. */
  .tab .tabcode {
    writing-mode: vertical-rl; text-orientation: upright;
    font-family: "Courier New", Courier, monospace;
    font-size: 16pt; font-weight: 700; letter-spacing: -0.2mm;
    margin: 1mm 0;
  }
  .tab .tabmark { font-size: 11pt; line-height: 1; }

  /* Reads as an alarm with no colour available. Full card width, below the tab
     row, so it cannot be mistaken for a caption on the details block. The word
     sits INLINE with the substance rather than on a line of its own — a
     landscape card has the width for it and cannot spare the row. */
  .allergy {
    background: #000; color: #fff;
    font-size: 13pt; font-weight: 800; line-height: 1.2;
    /* size drops in tiers below — see allergyClass() */
    letter-spacing: 0.3mm;
    padding: 0.9mm 2mm;
    /* Space below as well as above. The bar sits ABOVE the foot rule, so it
       reads as the last thing about the CHILD rather than a caption on the
       adult's phone number underneath. */
    margin: 1.2mm 0;
    border-radius: 1.5mm;
    text-align: center;
    text-transform: uppercase;
    /* Wraps to a second line rather than running off the bar. The tiers below
       keep the common cases to one line; the cap keeps the worst case to two. */
    overflow: hidden;
  }
  .allergy.long { font-size: 10.5pt; letter-spacing: 0.2mm; }
  .allergy.verylong { font-size: 8pt; letter-spacing: 0; line-height: 1.15; }
  .allergy .word {
    display: inline; font-size: 8pt; letter-spacing: 0.6mm; margin-right: 1.8mm;
  }
  .allergy.long .word, .allergy.verylong .word { font-size: 7.5pt; }

  /* ---- parent label ---- */

  /* QR beside the code rather than under it. Stacked, the parent slip used the
     top half of a landscape card and left the rest blank; side by side the
     codebar gets the full remaining width, which is what makes the code the
     biggest thing on either label — which is the entire point of the slip. */
  .label.parent { flex-direction: row; align-items: stretch; gap: 3mm; }
  .qr {
    flex: 0 0 auto; display: flex; align-items: center; justify-content: center;
  }
  /* 30mm carries a 4-character payload with room to spare at 300dpi, and the
     printed code beside it is the fallback if a scanner ever struggles. */
  .qr svg { width: 30mm; height: 30mm; display: block; }
  .slip {
    flex: 1; min-width: 0;
    display: flex; flex-direction: column; justify-content: center;
  }

  /* Service and date on their own lines rather than joined by a middot: a long
     service name wrapped mid-phrase and stranded the separator at the end of
     the first line. Two short lines always beat one that sometimes wraps. */
  .service { font-size: 12pt; font-weight: 800; text-align: center; line-height: 1.2; }
  /* The whole reason the parent label exists, in the strongest treatment on
     either label: knockout on solid black, monospaced so 8 and B cannot be
     confused when the code is read aloud across a busy corridor. */
  .codebar {
    background: #000; color: #fff;
    font-family: "Courier New", Courier, monospace;
    font-size: 30pt; font-weight: 700; letter-spacing: 1.5mm;
    text-align: center; line-height: 1.15;
    border-radius: 1.5mm;
    padding: 1.5mm 1mm 1.5mm 2.5mm; margin-top: 1.5mm;
    white-space: nowrap; overflow: hidden;
  }
  /* A six-character legacy code is seven glyphs once hyphenated, and seven
     glyphs at 30pt are 11mm wider than the bar. It shrinks; it does not spill. */
  .codebar.long { font-size: 25pt; letter-spacing: 1mm; }
  .retain {
    text-align: center; font-size: 9pt; font-weight: 700;
    margin-top: 1.5mm;
  }
  .who { text-align: center; font-size: 8pt; margin-top: 1mm; line-height: 1.25; }
  .who .hh { font-weight: 700; }
`;

/**
 * Long names shrink instead of running off the edge.
 *
 * The binding constraint is the longest single WORD, not the total: a name
 * wraps between words but not within one, so "Bethlehem Gebremariam" is set by
 * whether "Gebremariam" fits. Ethiopian names run long enough that this is the
 * common case, not the exception.
 *
 * The thresholds are set by the face, which is 77mm wide: the 96mm card less
 * 5mm of padding, 1mm of border, and the 13mm the edge tab and its gap take.
 * That is about 14 characters per line at 28pt, and the budget is TWO LINES —
 * the tiers exist to stop a third, not to stop a second. The reference tag the
 * ministry supplied wraps its name over two lines too, and "Kevin McCallister"
 * still does here.
 */
function nameClass(name: string): string {
  const words = name.trim().split(/\s+/);
  const longest = words.reduce((n, w) => Math.max(n, w.length), 0);
  const total = name.trim().length;
  if (longest <= 14 && total <= 28) return "name";
  if (longest <= 18 && total <= 37) return "name long";
  return "name verylong";
}

/**
 * The classroom shrinks instead of wrapping.
 *
 * It is the one field on this label that must never be CUT — it is the whole
 * reason a volunteer picks the tag up — but on a 58mm card it is also the one
 * that must never take a second line: the name already claims two, and the
 * allergy bar can claim two more.
 *
 * So it is sized down instead, to the largest tier that still fits on one line.
 * The width it has to fit into is the 77mm face, or about 52mm when the
 * first-time chip is sitting beside it — which is why the choice has to know
 * whether the chip is there. Character widths are Helvetica Bold's average of
 * roughly 0.55em, which is close enough at this granularity: the tiers are far
 * enough apart that a few percent of error cannot cross one.
 *
 * The 8pt floor is what makes the row's height BOUNDED. Classroom names are
 * free text and nothing stops a long one, so past the floor it wraps after all
 * — but two lines of 8pt is 6.5mm, barely more than the chip beside it already
 * costs, so the budget survives it. Everything realistic — "Blossom A",
 * "Chilliwack Campus", "Redeemed Elementary Class A" — lands on a tier and
 * stays on one line.
 */
const ROOM_TIERS: ReadonlyArray<readonly [string, number]> = [
  // class suffix, millimetres per character at that size
  ["room", 2.91],           // 15pt
  ["room long", 2.33],      // 12pt
  ["room verylong", 1.84],  // 9.5pt
  ["room tiny", 1.55],      // 8pt — the floor
];

/**
 * The detail line shrinks to stay on ONE line.
 *
 * It carries four things now — service, date, time and tag — and the service
 * label is free text a church types when it opens a session. "11:00 AM Amharic
 * Service · September 14 · 10:32 AM · Tag 1000" is 60 characters and wrapped to
 * a second line, which was 1.3mm more than the card had.
 *
 * Same treatment as the classroom above, against the same 77mm face: about 51
 * characters at 8.5pt, 58 at 7.5pt, 67 at 6.5pt. Past the floor it wraps after
 * all, but two lines of 6.5pt cost less than one extra line of 8.5pt did.
 */
const WHEN_TIERS: ReadonlyArray<readonly [string, number]> = [
  // class suffix, millimetres per character at that size
  ["when", 1.5],           // 8.5pt
  ["when long", 1.32],     // 7.5pt
  ["when verylong", 1.15], // 6.5pt — the floor
];

function whenClass(detail: string): string {
  const fits = WHEN_TIERS.find(([, mmPerChar]) => detail.length * mmPerChar <= 77);
  return (fits ?? WHEN_TIERS[WHEN_TIERS.length - 1])[0];
}

function roomClass(room: string, hasChip: boolean): string {
  const n = room.trim().length;
  const available = hasChip ? 52 : 77;
  const fits = ROOM_TIERS.find(([, mmPerChar]) => n * mmPerChar <= available);
  return (fits ?? ROOM_TIERS[ROOM_TIERS.length - 1])[0];
}

/**
 * Keeps the allergy bar inside the label.
 *
 * allergy_label_short is unbounded free text — nothing stops a volunteer typing
 * a paragraph into it — so the bar has to be bounded here, where the space is
 * finite. Size drops in tiers first, because shrinking loses nothing.
 *
 * The CAP is a last resort. 44 characters is exactly
 * "Peanuts, tree nuts, shellfish, dairy and eggs" — a full realistic list — and
 * the longest actually on file at ALIC is 21 ("Peanuts and tree nuts"). Past that the tag
 * stops being the record and the black bar does its actual job, which is to say
 * STOP AND ASK — the full detail is on the safety card at the desk, where
 * reading it is audited.
 *
 * The bar is a single nowrap line, so the cap is what stops it overflowing
 * sideways rather than what stops the card growing. The card cannot grow: it is
 * a fixed 58mm and the face flexes to whatever the bar leaves.
 */
const ALLERGY_CAP = 44;

/**
 * Tiers for the bar, chosen so the common cases stay on ONE line.
 *
 * The thresholds are per LINE now rather than per block, and they are measured
 * against UPPERCASE metrics — the bar is text-transform: uppercase, and capital
 * Helvetica Bold averages about 0.68em against 0.55em for mixed case. Sizing
 * these as if they were mixed case is what put "PEANUTS AND TREE NUTS" onto two
 * lines with "NUTS" alone on the second.
 *
 * The bar is 77mm wide, less 4mm of padding and the ~13mm the inline "ALLERGY"
 * and its gap take, so about 60mm of substance: 17 characters at 13pt, 22 at
 * 10.5pt, 31 at 8pt. Past 31 it wraps to a second line, and the 44-character
 * cap is what stops it reaching a third.
 */
function allergyClass(text: string): string {
  if (text.length > 22) return "allergy verylong";
  if (text.length > 17) return "allergy long";
  return "allergy";
}

function allergyText(raw: string): string {
  const t = raw.toUpperCase().trim();
  return t.length <= ALLERGY_CAP ? t : t.slice(0, ALLERGY_CAP - 1).trimEnd() + "…";
}

/** Wrap a card in the die-cut label it is rotated onto. */
function page(card: string): string {
  return `<div class="page">${card}</div>`;
}

export function buildChildLabel(data: ChildLabelData): string {
  const guardian = (data.guardianName ?? "").trim();
  const phone = (data.guardianPhone ?? "").trim();
  const hasGuardian = Boolean(guardian || phone);

  const room = data.roomName ?? "Check-in";
  // Joined rather than interpolated, so an absent service or time does not
  // print a leading or doubled separator.
  const detail = [
    data.serviceLabel,
    data.sessionDate,
    data.checkInTime,
    `Tag ${data.tagNumber}`,
  ]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" · ");

  return page(`
    <div class="label">
      <div class="face">
        <div class="${nameClass(data.childName)}">${esc(data.childName)}</div>
        <div class="rule"></div>
        <div class="metarow">
          <div class="${roomClass(room, !!data.isFirstTime)}">${esc(room)}</div>
          ${data.isFirstTime ? `<div class="firsttime">★ FIRST TIME</div>` : ""}
        </div>
        <div class="${whenClass(detail)}">${esc(detail)}</div>
        <div class="rule split"></div>
        ${
          data.allergyLabel
            ? `<div class="${allergyClass(data.allergyLabel.trim())}"><span class="word">Allergy</span>${esc(
                allergyText(data.allergyLabel)
              )}</div>`
            : ""
        }
        ${
          hasGuardian
            ? `<div class="rule"></div>
        <div class="guardian">
          ${guardian ? `<div class="gname">${esc(guardian)}</div>` : ""}
          ${phone ? `<div class="gphone">${esc(phone)}</div>` : ""}
        </div>`
            : ""
        }
      </div>
      <div class="tab">
        <span class="tabword">CODE</span>
        <span class="tabcode">${esc(data.pickupCode)}</span>
        <span class="tabmark">✓</span>
      </div>
    </div>`);
}

export function buildParentLabel(data: ParentLabelData): string {
  // Four characters read as one unit — the reference prints R2D2, not R2-D2.
  // A six-character legacy code still gets the grouping that made it readable.
  const code = data.pickupCode.length === 6
    ? `${data.pickupCode.slice(0, 3)}-${data.pickupCode.slice(3)}`
    : data.pickupCode;

  return page(`
    <div class="label parent">
      ${data.qrSvg ? `<div class="qr">${data.qrSvg}</div>` : ""}
      <div class="slip">
        <div class="service">${esc(data.serviceLabel)}<br>${esc(data.sessionDate)}</div>
        <div class="codebar${code.length > 5 ? " long" : ""}">${esc(code)}</div>
        <div class="retain">Retain for child pickup</div>
        <div class="who">
          <span class="hh">${esc(data.householdName)}</span> · ${esc(data.childCount)} ${
            data.childCount === 1 ? "child" : "children"
          }
          ${
            data.childNames && data.childNames.length
              ? `<br>${esc(data.childNames.join(", "))}`
              : ""
          }
        </div>
      </div>
    </div>`);
}

/** Complete printable document: one child label each, then the parent label. */
export function buildLabelDocument(
  children: ChildLabelData[],
  parent: ParentLabelData
): string {
  const body = [...children.map(buildChildLabel), buildParentLabel(parent)].join("\n");
  return `<!doctype html><html><head><meta charset="utf-8">
<title>Kids labels</title><style>${LABEL_CSS}</style></head>
<body>${body}</body></html>`;
}
