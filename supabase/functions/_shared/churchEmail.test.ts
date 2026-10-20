import { describe, expect, it } from "vitest";
import {
  type ChurchEmail,
  greeting,
  keepLastWordsTogether,
  renderChurchEmail,
  renderChurchText,
} from "./churchEmail.ts";

const email = (over: Partial<ChurchEmail> = {}): ChurchEmail => ({
  subject: "Subject",
  subtitle: "Finance · Expenses",
  title: "Title",
  recipientName: "Muluken Mekuriya",
  blocks: [
    { kind: "paragraph", text: "First." },
    { kind: "fact", label: "Expense", value: "$500.00", note: "Approved", tone: "green" },
    { kind: "quote", heading: "Notes from Jane", text: "Line one\nline two" },
    { kind: "button", label: "Open", url: "https://alic.org/budget?tab=expenses&x=1" },
  ],
  signOff: { line: "Blessings,", from: "ALIC Finance" },
  noReply: "Replies are not read.",
  ...over,
});

describe("the church's email", () => {
  it("greets by first name, or just Selam", () => {
    expect(greeting("Muluken Mekuriya")).toBe("Selam Muluken,");
    expect(greeting("  ")).toBe("Selam,");
    expect(greeting(null)).toBe("Selam,");
  });

  it("holds the last two words together", () => {
    expect(keepLastWordsTogether("please speak to the finance team.")).toBe(
      "please speak to the\u00a0finance\u00a0team.",
    );
  });

  it("draws the blocks in the order given, in the tone given", () => {
    const html = renderChurchEmail(email());
    const order = ["First.", "$500.00", "Notes from Jane", "Open"].map((s) => html.indexOf(s));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(html).toContain("border:2px solid #15803d");
    expect(html).toContain("Line one<br>line two");
    expect(html).toContain('href="https://alic.org/budget?tab=expenses&amp;x=1"');
  });

  it("adds a verse only when there is one", () => {
    expect(renderChurchEmail(email())).not.toContain("font-style:italic");
    expect(renderChurchEmail(email({ verse: "A verse." }))).toContain("A verse.");
  });

  it("says the same in plain text", () => {
    expect(renderChurchText(email())).toBe(
      [
        "Selam Muluken,",
        "First.",
        "EXPENSE:  $500.00 (Approved)",
        "Notes from Jane:\nLine one\nline two",
        "Open:\nhttps://alic.org/budget?tab=expenses&x=1",
        "Blessings,\nALIC Finance",
        "Replies are not read.\n\nAddis Lidet International Church\nSilver Spring, MD · Alexandria, VA\nalic.org",
      ].join("\n\n"),
    );
  });
});
