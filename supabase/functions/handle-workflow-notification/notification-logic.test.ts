/**
 * Who hears about each status change, and what they are told.
 *
 * This file used to carry its own copy of the notification logic and test
 * that, so it passed whatever the function did. It now imports content.ts,
 * which index.ts sends from.
 */
import { describe, expect, it } from "vitest";
import { renderChurchEmail, renderChurchText } from "../_shared/churchEmail.ts";
import { financeEmail } from "../_shared/financeEmail.ts";
import {
  type AllocationRecord,
  type ExpenseRecord,
  getAllocationNotificationContent,
  getExpenseNotificationContent,
} from "./content.ts";

const expense: ExpenseRecord = {
  id: "exp-001",
  title: "Office Supplies",
  amount: 500,
  ministryName: "Youth Ministry",
  organizationId: "org-001",
  requesterName: "John Doe",
  requesterEmail: "john@example.com",
  reviewerName: "Jane Smith",
  reviewerNotes: "Looks good, approved.",
  paymentReference: "PAY-12345",
};

const allocation: AllocationRecord = {
  id: "alloc-001",
  ministryName: "Worship Ministry",
  organizationId: "org-001",
  requesterName: "Alice Johnson",
  requesterEmail: "alice@example.com",
  requestedAmount: 2000,
  approvedAmount: 1500,
  adminNotes: "Partially approved due to budget constraints.",
  fiscalYear: 2027,
  reviewerName: "Abebe Kebede",
};

describe("who hears about an expense", () => {
  const transitions = [
    { name: "submit", from: "draft", to: "pending_leader", requester: true, role: "admin" },
    { name: "leader approve", from: "pending_leader", to: "leader_approved", requester: true, role: "treasury" },
    { name: "leader deny", from: "pending_leader", to: "leader_denied", requester: true, role: null },
    { name: "recall", from: "leader_approved", to: "pending_leader", requester: true, role: null },
    { name: "treasury approve", from: "leader_approved", to: "treasury_approved", requester: true, role: "finance" },
    { name: "treasury deny", from: "leader_approved", to: "treasury_denied", requester: true, role: null },
    { name: "complete", from: "treasury_approved", to: "completed", requester: true, role: null },
    { name: "cancel", from: "pending_leader", to: "cancelled", requester: true, role: null },
    { name: "unknown", from: "pending_leader", to: "something_else", requester: false, role: null },
  ];
  for (const t of transitions) {
    it(`[${t.name}] ${t.from} → ${t.to}: requester=${t.requester}, reviewers=${t.role ?? "none"}`, () => {
      const plan = getExpenseNotificationContent(t.from, t.to, expense);
      expect(!!plan.requesterContent).toBe(t.requester);
      expect(plan.reviewerRole).toBe(t.role);
      expect(!!plan.reviewerContent).toBe(t.role !== null);
    });
  }
});

describe("who hears about a budget request", () => {
  const transitions = [
    { name: "submit", from: "draft", to: "pending", requester: false, role: "admin" },
    { name: "approve", from: "pending", to: "approved", requester: true, role: null },
    { name: "partially approve", from: "pending", to: "partially_approved", requester: true, role: null },
    { name: "deny", from: "pending", to: "denied", requester: true, role: null },
    { name: "recall", from: "approved", to: "pending", requester: true, role: null },
    { name: "cancel", from: "pending", to: "cancelled", requester: true, role: null },
    { name: "unknown", from: "pending", to: "something_else", requester: false, role: null },
  ];
  for (const t of transitions) {
    it(`[${t.name}] ${t.from} → ${t.to}: requester=${t.requester}, reviewers=${t.role ?? "none"}`, () => {
      const plan = getAllocationNotificationContent(t.from, t.to, allocation);
      expect(!!plan.requesterContent).toBe(t.requester);
      expect(plan.reviewerRole).toBe(t.role);
      expect(!!plan.reviewerContent).toBe(t.role !== null);
    });
  }
});

describe("what an expense notice says", () => {
  it("asks the admins to review a new request, with the amount and a link to it", () => {
    const m = getExpenseNotificationContent("draft", "pending_leader", expense).reviewerContent!;
    expect(m.subject).toBe("New expense request: Office Supplies");
    expect(m.paragraphs[0]).toBe("John Doe from Youth Ministry has submitted an expense request for “Office Supplies”.");
    expect(m.fact).toEqual({ label: "Expense", value: "$500.00", note: "Waiting for your review", tone: "amber" });
    expect(m.button).toEqual({ label: "Review the request", url: "https://alic.org/budget?tab=expenses" });
  });

  it("names the approver and passes on their notes", () => {
    const m = getExpenseNotificationContent("pending_leader", "leader_approved", expense).requesterContent!;
    expect(m.paragraphs[0]).toContain("approved by Jane Smith");
    expect(m.fact.tone).toBe("green");
    expect(m.notes).toEqual({ heading: "Notes from Jane Smith", text: "Looks good, approved." });
  });

  it("says 'the reviewer' when the reviewer is not known", () => {
    const m = getExpenseNotificationContent("pending_leader", "leader_denied", { ...expense, reviewerName: null })
      .requesterContent!;
    expect(m.paragraphs[0]).toContain("not approved by the reviewer. Their notes are below.");
    expect(m.notes?.heading).toBe("Notes");
    expect(m.fact.tone).toBe("red");
  });

  it("gives the payment reference when there is one, and nothing made up when not", () => {
    const paid = getExpenseNotificationContent("treasury_approved", "completed", expense).requesterContent!;
    expect(paid.fact.note).toBe("Reference PAY-12345");
    const noRef = getExpenseNotificationContent("treasury_approved", "completed", { ...expense, paymentReference: null })
      .requesterContent!;
    expect(noRef.fact.note).toBe("Payment complete");
  });

  it("sends finance to process an approved payment", () => {
    const m = getExpenseNotificationContent("leader_approved", "treasury_approved", expense).reviewerContent!;
    expect(m.subject).toBe("Payment ready to process: Office Supplies");
    expect(m.button?.label).toBe("Process the payment");
  });

  it("offers no button on a cancelled request", () => {
    const m = getExpenseNotificationContent("pending_leader", "cancelled", expense).requesterContent!;
    expect(m.button ?? null).toBeNull();
    expect(m.fact.tone).toBe("gray");
  });
});

describe("what a budget request notice says", () => {
  it("tells the admins which year the request is for", () => {
    const m = getAllocationNotificationContent("draft", "pending", allocation).reviewerContent!;
    expect(m.subject).toBe("New budget request: Worship Ministry");
    expect(m.title).toBe("A 2027 budget request is waiting for your review");
    expect(m.fact).toEqual({ label: "Budget request · 2027", value: "$2,000.00", note: "Waiting for your review", tone: "amber" });
    expect(m.button?.url).toBe("https://alic.org/budget?tab=allocations");
  });

  it("says how much of a partly approved request was granted", () => {
    const m = getAllocationNotificationContent("pending", "partially_approved", allocation).requesterContent!;
    expect(m.paragraphs[0]).toBe(
      "The 2027 budget request for Worship Ministry has been approved for $1,500.00 of the $2,000.00 requested.",
    );
    expect(m.fact.note).toBe("Approved, of $2,000.00 requested");
    expect(m.notes?.heading).toBe("Notes from Abebe Kebede");
  });

  it("falls back to the requested amount when no approved amount was set", () => {
    const m = getAllocationNotificationContent("pending", "approved", { ...allocation, approvedAmount: null })
      .requesterContent!;
    expect(m.fact.value).toBe("$2,000.00");
    expect(m.fact.note).toBe("Approved");
  });

  it("leaves the year out when it is not known", () => {
    const m = getAllocationNotificationContent("pending", "denied", { ...allocation, fiscalYear: null }).requesterContent!;
    expect(m.title).toBe("Your budget request was not approved");
    expect(m.fact.label).toBe("Budget request");
  });
});

describe("the finance notice as an email", () => {
  it("greets by first name, signs as finance and carries no verse", () => {
    const m = getExpenseNotificationContent("draft", "pending_leader", expense).reviewerContent!;
    const text = renderChurchText(financeEmail("Admasu Lalisho", m));
    expect(text.startsWith("Selam Admasu,")).toBe(true);
    expect(text).toContain("EXPENSE:  $500.00 (Waiting for your review)");
    expect(text).toContain("Blessings,\nALIC Finance");
    expect(text).not.toContain("Proverbs");
  });

  it("has the church's band and logo, not the old broken one", () => {
    const m = getAllocationNotificationContent("draft", "pending", allocation).reviewerContent!;
    const html = renderChurchEmail(financeEmail("Admasu Lalisho", m));
    expect(html).toContain('src="https://alic.org/alic-logo.png"');
    expect(html).toContain("Finance · Budget requests");
    expect(html).not.toContain("addislidet");
  });

  it("escapes what people typed", () => {
    const m = getExpenseNotificationContent("pending_leader", "leader_denied", {
      ...expense,
      title: "<b>Chairs</b>",
      reviewerNotes: "Use \"the\" form & resend",
    }).requesterContent!;
    const html = renderChurchEmail(financeEmail("John", m));
    expect(html).toContain("&lt;b&gt;Chairs&lt;/b&gt;");
    expect(html).toContain("Use &quot;the&quot; form &amp; resend");
    expect(html).not.toContain("<b>Chairs</b>");
  });
});
