/**
 * Label template tests.
 *
 * The safety-relevant assertions here are about what must NOT appear on the
 * PARENT's label: no classroom, no medical detail. A slip dropped in a car park
 * should not tell a stranger where a named child is sitting.
 *
 * The child's tag now carries the same pickup code as the parent slip, by the
 * ministry lead's decision — see the note at the top of labelTemplate.ts. The
 * test below pins that deliberately, so a future reader does not restore the
 * old two-namespace rule by accident.
 *
 * The geometry block at the bottom is the other half of the job. The card is
 * LANDSCAPE and is rotated a quarter turn onto a portrait DK-1202 die-cut, so
 * the page, the card and the transform have to agree with each other or the
 * ink walks off the label. Those three are pinned together rather than
 * separately, because pinning them separately is what lets them drift.
 */

import { describe, it, expect } from "vitest";
import {
  buildChildLabel,
  buildParentLabel,
  buildLabelDocument,
  LABEL_CSS,
  LABEL_PAGE_MM,
  LABEL_CARD_MM,
} from "./labelTemplate";

const CHILD = {
  childName: "Noah Bekele",
  roomName: "Blossom A",
  tagNumber: 1000,
  pickupCode: "3R6F4T",
  allergyLabel: "Peanut allergy",
  serviceLabel: "9:00 AM Service",
  sessionDate: "Aug 24",
  checkInTime: "10:32 AM",
};

const PARENT = {
  householdName: "Bekele Household",
  childCount: 2,
  pickupCode: "3R6F4T",
  qrSvg: "<svg></svg>",
  serviceLabel: "9:00 AM Service",
  sessionDate: "Aug 24",
};

describe("child label", () => {
  it("shows the name, the classroom and when the child arrived", () => {
    const html = buildChildLabel(CHILD);
    expect(html).toContain("Noah Bekele");
    expect(html).toContain("Blossom A");
    // The TIME replaced the tag number on this line, by the ministry's call: a
    // volunteer looking at a tag wants to know how long the child has been in
    // the room, and the tag number never told them that.
    expect(html).toContain("10:32 AM");
    // The tag number sits BESIDE the time, not instead of it. It is the only
    // thing on the label the live board can be searched by — the pickup code
    // is stored as an HMAC in a vault that grants SELECT to nobody, so no list
    // can ever show it. Dropping this from the tag closes the only route from
    // a tag in a volunteer's hand to a row on a screen.
    expect(html).toContain("Tag 1000");
  });

  it("joins the detail line without stranding a separator", () => {
    // service_label is "" on a session with no name, and the time is optional.
    // Interpolating blindly printed a leading " · " on both.
    expect(buildChildLabel({ ...CHILD, serviceLabel: "" })).toContain(
      'class="when">Aug 24 · 10:32 AM · Tag 1000<'
    );
    expect(buildChildLabel({ ...CHILD, checkInTime: undefined })).toContain(
      'class="when">9:00 AM Service · Aug 24 · Tag 1000<'
    );
  });

  it("prints the guardian at the foot when one is known", () => {
    const html = buildChildLabel({
      ...CHILD,
      guardianName: "Almaz Tesfaye",
      guardianPhone: "\u2022\u2022\u2022-0101",
    });
    expect(html).toContain("Almaz Tesfaye");
    expect(html).toContain("\u2022\u2022\u2022-0101");
  });

  it("omits the guardian row entirely when nobody is named", () => {
    // An empty rule and a blank line read as missing data rather than as
    // data that was never collected.
    expect(buildChildLabel(CHILD)).not.toContain('class="guardian"');
    expect(
      buildChildLabel({ ...CHILD, guardianName: "  ", guardianPhone: null })
    ).not.toContain('class="guardian"');
  });

  it("renders an approved allergy as an uppercase knockout bar", () => {
    // Direct thermal is monochrome, so the warning cannot rely on colour.
    const html = buildChildLabel(CHILD);
    expect(html).toContain("PEANUT ALLERGY");
    expect(html).toContain('class="allergy"');
  });

  it("omits the allergy bar entirely when there is none", () => {
    const html = buildChildLabel({ ...CHILD, allergyLabel: null });
    expect(html).not.toContain('class="allergy"');
  });

  it("marks a first-time visitor", () => {
    expect(buildChildLabel({ ...CHILD, isFirstTime: true })).toContain("FIRST TIME");
    expect(buildChildLabel(CHILD)).not.toContain("FIRST TIME");
  });

  it("carries the pickup code in the edge tab", () => {
    // A REVERSAL, pinned on purpose. The tab used to hold the tag number so
    // that seeing a child told you nothing about how to release them. The
    // ministry lead chose the matching-key model instead: both halves show the
    // same code, and the control moved to the desk, which names and records
    // whoever collects.
    const html = buildChildLabel(CHILD);
    expect(html).toContain('class="tabword">CODE<');
    expect(html).toContain('class="tabcode">3R6F4T<');
  });

  it("prints a dialable phone, not a masked one", () => {
    // A masked number is useless to the volunteer holding a crying child,
    // which is the situation the number is on the tag for.
    const html = buildChildLabel({ ...CHILD, guardianPhone: "301-555-0102" });
    expect(html).toContain("301-555-0102");
  });
});

describe("the foot of the tag", () => {
  const FOOT = {
    ...CHILD,
    guardianName: "Almaz Tesfaye",
    guardianPhone: "301-555-0102",
    allergyLabel: "Peanut allergy",
  };

  it("puts the allergy bar ABOVE the foot rule and the guardian line", () => {
    // Ordered on purpose. The bar is the thing that has to stop a volunteer,
    // so it sits with the child's own details, above the rule that divides
    // them from the adult's phone number — not below it at the bottom edge,
    // where a curled tag hides it.
    const html = buildChildLabel(FOOT);
    const bar = html.indexOf('class="allergy');
    expect(bar).toBeLessThan(html.lastIndexOf('class="rule"'));
    expect(bar).toBeLessThan(html.indexOf('class="guardian"'));
  });

  it("right-aligns the phone even when nobody was named", () => {
    // The regression this pins: justify-content: space-between put a LONE
    // child at the START, so a tag with a phone and no named adult printed the
    // number hard against the left edge. The auto margin is what fixes it, so
    // the rule must not go back to space-between.
    expect(LABEL_CSS).toContain("margin-left: auto");
    const guardianRule = LABEL_CSS.slice(LABEL_CSS.indexOf("  .guardian {"));
    expect(guardianRule.slice(0, guardianRule.indexOf("}"))).not.toContain("space-between");
    // The row still renders with the phone alone in it.
    const html = buildChildLabel({ ...FOOT, guardianName: null });
    expect(html).toContain('class="gphone"');
    expect(html).not.toContain('class="gname"');
  });

  it("names who dropped off at the left, phone at the right", () => {
    const html = buildChildLabel(FOOT);
    expect(html.indexOf("Almaz Tesfaye")).toBeLessThan(html.indexOf("301-555-0102"));
    expect(html).toContain('class="gname"');
    expect(html).toContain('class="gphone"');
  });

  // Matches "rule" and "rule split" alike. Counting only class="rule" missed
  // the split rule entirely and quietly passed.
  const rules = (html: string) => (html.match(/class="rule[ "]/g) || []).length;

  it("closes the child's details with a rule, above the allergy bar", () => {
    // The rule the reference tag has under its date line. It also carries the
    // auto margin that pushes the foot down, so it is structural, not decor:
    // it is present whether or not there is anything below it.
    const html = buildChildLabel(FOOT);
    expect(html).toContain('class="rule split"');
    const split = html.indexOf('class="rule split"');
    expect(html.indexOf('class="when"')).toBeLessThan(split);
    expect(split).toBeLessThan(html.indexOf('class="allergy'));
    // Still there on the barest possible tag.
    expect(
      buildChildLabel({
        ...FOOT,
        allergyLabel: null,
        guardianName: null,
        guardianPhone: null,
      })
    ).toContain('class="rule split"');
  });

  it("rules off the guardian line, and nothing else", () => {
    // Three rules with a full foot: under the name, under the details, above
    // the adult. The black bar is its own divider, so an allergy with no named
    // adult must not leave a hairline hanging under it — that reads as a label
    // that was cut off.
    expect(rules(buildChildLabel(FOOT))).toBe(3);
    expect(rules(buildChildLabel({ ...FOOT, allergyLabel: null }))).toBe(3);
    expect(
      rules(buildChildLabel({ ...FOOT, guardianName: null, guardianPhone: null }))
    ).toBe(2);
  });

  it("puts the auto margin on the split rule, not the detail line", () => {
    // A rule emitted AFTER an auto margin gets pushed to the bottom with
    // everything else, which is where this one landed the first time.
    expect(LABEL_CSS).toContain(".rule.split { margin-bottom: auto; }");
    const when = LABEL_CSS.slice(LABEL_CSS.indexOf("  .when {"));
    expect(when.slice(0, when.indexOf("}"))).not.toContain("auto");
  });
});

describe("fitting a landscape card", () => {
  /**
   * The card is a FIXED 58mm tall. Nothing on it may grow without bound, and
   * the three unbounded inputs — the name, the classroom and the allergy text —
   * each have their own way of giving in. These pin WHICH way, because the
   * wrong one is a silent safety failure rather than an ugly label.
   */

  it("shrinks the detail line rather than letting it take a second row", () => {
    // Four things share this line now, and service_label is free text a church
    // types when it opens a session. At full size the long-but-realistic
    // combination wrapped, which cost 1.3mm the card did not have.
    expect(buildChildLabel(CHILD)).toContain('class="when"');
    expect(
      buildChildLabel({
        ...CHILD,
        serviceLabel: "11:00 AM Amharic Service",
        sessionDate: "September 14",
      })
    ).toContain('class="when verylong"');
  });

  it("shrinks a long classroom rather than truncating it", () => {
    // The classroom is the whole reason a volunteer picks the tag up, so it is
    // the one field that must never be cut. It gets smaller instead.
    const html = buildChildLabel({ ...CHILD, roomName: "Redeemed Elementary Class A" });
    expect(html).toContain("Redeemed Elementary Class A");
    expect(html).not.toContain("…");
    expect(html).toContain('class="room long"');
  });

  it("drops the classroom a tier when the first-time chip shares its line", () => {
    // Same name, ~25mm less room to put it in. A tier that ignored the chip put
    // the classroom onto a second line, and a second line is what the card
    // cannot afford.
    const room = "Redeemed Elementary A";
    expect(buildChildLabel({ ...CHILD, roomName: room })).toContain('class="room"');
    expect(
      buildChildLabel({ ...CHILD, roomName: room, isFirstTime: true })
    ).toContain('class="room long"');
  });

  it("keeps the smallest classroom tier as a floor, never an ellipsis", () => {
    const absurd = "Redeemed Elementary Class A Overflow Room 1234567";
    const html = buildChildLabel({ ...CHILD, roomName: absurd, isFirstTime: true });
    expect(html).toContain('class="room tiny"');
    expect(html).toContain(absurd);
  });

  it("shrinks a long name in tiers, and keeps the reference name at full size", () => {
    // "Kevin McCallister" is the name on the tag the ministry handed over. It
    // wraps to two lines at full size there and must here too.
    expect(buildChildLabel({ ...CHILD, childName: "Kevin McCallister" })).toContain(
      'class="name"'
    );
    expect(
      buildChildLabel({ ...CHILD, childName: "Woldegiorgisos Gebremariamosos" })
    ).toContain('class="name long"');
    expect(
      buildChildLabel({ ...CHILD, childName: "Christopherson Vandermeulenbergenson" })
    ).toContain('class="name verylong"');
  });

  it("shrinks a six-character pickup code on the parent slip", () => {
    // Hyphenated it is seven glyphs, and seven glyphs at full size are wider
    // than the bar. It shrinks; it does not spill.
    expect(buildParentLabel(PARENT)).toContain('class="codebar long"');
    expect(buildParentLabel({ ...PARENT, pickupCode: "R2D2" })).toContain('class="codebar"');
  });
});

describe("parent label", () => {
  it("shows the pickup code, hyphenated for readability", () => {
    const html = buildParentLabel(PARENT);
    expect(html).toContain("3R6-F4T");
  });

  it("does NOT reveal the classroom (KID-010)", () => {
    const html = buildParentLabel(PARENT);
    expect(html).not.toContain("Blossom");
  });

  it("does NOT reveal medical information", () => {
    const html = buildParentLabel(PARENT);
    expect(html.toLowerCase()).not.toContain("peanut");
    expect(html.toLowerCase()).not.toContain("allergy");
  });

  it("shows a child count rather than names by default", () => {
    const html = buildParentLabel(PARENT);
    expect(html).toContain("2 children");
    expect(html).not.toContain("Noah");
  });

  it("can show names when the church opts in", () => {
    const html = buildParentLabel({ ...PARENT, childNames: ["Noah", "Maya"] });
    expect(html).toContain("Noah, Maya");
  });

  it("handles a single child without saying '1 children'", () => {
    expect(buildParentLabel({ ...PARENT, childCount: 1 })).toContain("1 child");
  });

  it("omits the QR block when generation was unavailable", () => {
    const html = buildParentLabel({ ...PARENT, qrSvg: null });
    expect(html).not.toContain('class="qr"');
    // The human-readable code must still be there — it is the fallback.
    expect(html).toContain("3R6-F4T");
  });
});

describe("escaping", () => {
  it("escapes a name containing markup rather than emitting it", () => {
    const html = buildChildLabel({
      ...CHILD,
      childName: '<script>alert("x")</script>',
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes ampersands and apostrophes in names", () => {
    const html = buildChildLabel({ ...CHILD, childName: "O'Brien & Sons" });
    expect(html).toContain("O&#39;Brien &amp; Sons");
  });

  it("leaves Amharic names intact", () => {
    const html = buildChildLabel({ ...CHILD, childName: "አበበ በቀለ" });
    expect(html).toContain("አበበ በቀለ");
  });
});

describe("label document", () => {
  it("emits one child label per child plus one parent label", () => {
    const doc = buildLabelDocument([CHILD, { ...CHILD, childName: "Maya Bekele" }], PARENT);
    const labelCount = (doc.match(/class="label/g) || []).length;
    expect(labelCount).toBe(3);
    expect(doc).toContain("Noah Bekele");
    expect(doc).toContain("Maya Bekele");
    expect(doc).toContain("3R6-F4T");
  });

  it("sets the page the Brother QL driver reports for a DK-1202 die-cut", () => {
    const doc = buildLabelDocument([CHILD], PARENT);
    expect(doc).toContain("@page { size: 62mm 100mm; margin: 0; }");
  });

  it("keeps the declared page and the CSS in step", () => {
    // Both numbers are the die-cut's and neither is ours to choose.
    expect(LABEL_PAGE_MM).toEqual({ width: 62, length: 100 });
    expect(LABEL_CSS).toContain(
      `@page { size: ${LABEL_PAGE_MM.width}mm ${LABEL_PAGE_MM.length}mm; margin: 0; }`
    );
  });

  it("gives every label its own die-cut page", () => {
    // One label per page. If a card ever paginated, the desk would hand out one
    // label cut in half and one nearly blank.
    const doc = buildLabelDocument([CHILD, { ...CHILD, childName: "Maya" }], PARENT);
    expect((doc.match(/class="page"/g) || []).length).toBe(3);
  });

  it("caps the allergy text so a label cannot grow without bound", () => {
    // allergy_label_short is unbounded free text in the database.
    const long = "Peanuts, ".repeat(40);
    const html = buildChildLabel({ ...CHILD, allergyLabel: long });
    const bar = /<div class="allergy[^"]*"><span class="word">Allergy<\/span>([^<]*)</.exec(html);
    expect(bar).toBeTruthy();
    expect(bar![1].length).toBeLessThanOrEqual(44);
    expect(bar![1].endsWith("\u2026")).toBe(true);
  });

  it("shrinks the allergy bar in tiers rather than truncating early", () => {
    // Tiers at 18 and 30 characters. Sized so the tallest possible label still
    // fits the 86mm card — see LABEL_PAGE_MM.
    expect(buildChildLabel({ ...CHILD, allergyLabel: "Dairy" })).toContain('class="allergy"');
    expect(
      buildChildLabel({ ...CHILD, allergyLabel: "Peanuts and tree nuts" })
    ).toContain('class="allergy long"');
    expect(
      buildChildLabel({ ...CHILD, allergyLabel: "Peanuts, tree nuts and shellfish" })
    ).toContain('class="allergy verylong"');
  });

  it("is a complete standalone document", () => {
    const doc = buildLabelDocument([CHILD], PARENT);
    expect(doc.startsWith("<!doctype html>")).toBe(true);
    expect(doc).toContain("<meta charset=\"utf-8\">");
  });
});

describe("label CSS", () => {
  it("forces colour printing of the knockout allergy bar", () => {
    // Without this the black bar can print as an empty outline.
    expect(LABEL_CSS).toContain("print-color-adjust: exact");
  });

  it("declares the document's width, so Safari has nothing to shrink", () => {
    // Safari ignores @page size and scales its own layout onto the paper, so a
    // document wider than the label prints the label smaller. An iPhone was
    // putting out roughly 60% cards before this.
    const htmlBody = LABEL_CSS.slice(
      LABEL_CSS.indexOf("  html, body {"),
      LABEL_CSS.indexOf("  body {")
    );
    expect(htmlBody).toContain(`width: ${LABEL_PAGE_MM.width}mm;`);
  });

  it("never fixes the document's height", () => {
    // One .page per label lives in this body. A body height would hold the
    // first label and drop the rest of the family's.
    const htmlBody = LABEL_CSS.slice(
      LABEL_CSS.indexOf("  html, body {"),
      LABEL_CSS.indexOf("  body {")
    );
    expect(htmlBody).not.toMatch(/^\s*height:/m);
  });
});

/**
 * The landscape geometry.
 *
 * These are pinned TOGETHER rather than one at a time. The card, the page and
 * the rotation are three statements of the same fact, and the failure they
 * guard against is one of them being edited alone — which does not look wrong
 * in a diff and prints as a card sliding off the edge of the label.
 */
describe("landscape geometry", () => {
  const GUTTER = 2;

  it("is a landscape card: wider than it is tall", () => {
    // The whole point of the change. A portrait tag runs off the bottom of a
    // small child's shirt and does not fit a lanyard sleeve.
    expect(LABEL_CARD_MM.width).toBeGreaterThan(LABEL_CARD_MM.height);
  });

  it("insets the card in the die-cut by an equal gutter on all four sides", () => {
    // The card's LONG edge runs along the page's LONG edge — that is the
    // quarter turn, stated as arithmetic.
    expect(LABEL_CARD_MM.width + 2 * GUTTER).toBe(LABEL_PAGE_MM.length);
    expect(LABEL_CARD_MM.height + 2 * GUTTER).toBe(LABEL_PAGE_MM.width);
  });

  it("declares the card at the size the constants claim", () => {
    expect(LABEL_CSS).toContain(
      `width: ${LABEL_CARD_MM.width}mm; height: ${LABEL_CARD_MM.height}mm;`
    );
    expect(LABEL_CSS).toContain(
      `width: ${LABEL_PAGE_MM.width}mm; height: ${LABEL_PAGE_MM.length}mm;`
    );
  });

  it("rotates the card onto the page with the offset the gutter implies", () => {
    // rotate(90deg) about the origin maps (x, y) to (-y, x), which leaves the
    // card at x in [-height, 0]. The translate has to put it back: x by the
    // page width less the gutter, y by the gutter. Verified against Chrome —
    // the painted card lands at 2..60mm across and 2..98mm along, half a
    // millimetre inside Brother's 1.5..60.5 x 1.5..98.5mm printable window.
    const x = LABEL_PAGE_MM.width - GUTTER;
    expect(LABEL_CSS).toContain(`transform: translate(${x}mm, ${GUTTER}mm) rotate(90deg);`);
    // Order matters: transforms apply right to left, so the rotate must come
    // second in the string and therefore FIRST in effect.
    expect(LABEL_CSS).toContain("transform-origin: 0 0;");
  });

  it("clips the card's untransformed overhang at the page", () => {
    // A transform does not affect layout, so the 96mm card still occupies 96mm
    // of width inside a 62mm page. Without overflow: hidden on .page that
    // overhang can force the printer onto a second page.
    const pageRule = LABEL_CSS.slice(LABEL_CSS.indexOf("  .page {"));
    expect(pageRule.slice(0, pageRule.indexOf("}"))).toContain("overflow: hidden");
  });
});
