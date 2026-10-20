import { describe, expect, it } from "vitest";
import { renderChurchText } from "../_shared/churchEmail.ts";
import { financeEmail } from "../_shared/financeEmail.ts";
import { flagMessage } from "./content.ts";

const flag = {
  ministryName: "Alic MD Youth",
  flagType: "missing_receipts",
  flaggedByName: "Abebe Kebede",
  notes: "Receipts for the retreat are still outstanding.",
  expenseTitle: "Youth retreat",
  expenseAmount: 1200,
};

describe("the ministry flag notice", () => {
  it("says what was flagged, by whom, and what clears it", () => {
    const m = flagMessage(flag);
    expect(m.subject).toBe("Ministry flagged: Alic MD Youth — Missing Receipts");
    expect(m.title).toBe("Alic MD Youth has been flagged for missing receipts");
    expect(m.paragraphs).toEqual([
      "Abebe Kebede has flagged Alic MD Youth for missing receipts.",
      "New expense requests from the ministry are on hold until the flag is resolved. Please send the missing receipts as soon as you can.",
    ]);
    expect(m.fact).toEqual({ label: "Related expense", value: "$1,200.00", note: "“Youth retreat”", tone: "red" });
    expect(m.notes).toEqual({ heading: "Notes from Abebe Kebede", text: flag.notes });
  });

  it("asks for the money back when funds were not returned", () => {
    expect(flagMessage({ ...flag, flagType: "unreturned_funds" }).paragraphs[1]).toContain(
      "Please return the unspent funds",
    );
  });

  it("shows the expense by name when it has no amount", () => {
    const m = flagMessage({ ...flag, expenseAmount: null, notes: null, flaggedByName: null });
    expect(m.fact).toEqual({ label: "Related expense", value: "Youth retreat", note: "Missing Receipts", tone: "red" });
    expect(m.notes ?? null).toBeNull();
    expect(m.paragraphs[0]).toBe("The finance team has flagged Alic MD Youth for missing receipts.");
  });

  it("reads as the church's email", () => {
    const text = renderChurchText(financeEmail("Muluken Mekuriya", flagMessage(flag)));
    expect(text.startsWith("Selam Muluken,")).toBe(true);
    expect(text).toContain("Open the Budget page:\nhttps://alic.org/budget?tab=expenses");
  });
});
