/**
 * Unit tests for handle-workflow-notification edge function logic.
 *
 * The pure notification logic is defined inline here (mirroring the edge
 * function's index.ts) so we can test with vitest without Deno dependencies.
 */
import { describe, it, expect } from "vitest";

// ─── Types (mirrors index.ts) ───────────────────────────────────────────────

interface EmailContent {
  subject: string;
  heading: string;
  message: string;
  statusColor: string;
  statusBadge: string;
  amount?: number;
  reviewerNotes?: string;
  showActionButton: boolean;
  actionButtonText: string;
  actionUrl?: string;
}

interface ExpenseRecord {
  id: string;
  title: string;
  amount: number;
  ministryName: string;
  organizationId: string;
  requesterName: string;
  requesterEmail: string | null;
  reviewerName: string | null;
  reviewerNotes: string | null;
  paymentReference: string | null;
}

interface AllocationRecord {
  id: string;
  ministryName: string;
  organizationId: string;
  requesterName: string;
  requesterEmail: string | null;
  requestedAmount: number;
  approvedAmount: number | null;
  adminNotes: string | null;
}

interface NotificationResult {
  requesterContent: EmailContent | null;
  reviewerContent: EmailContent | null;
  reviewerRole: string | null;
}

// ─── Pure logic (mirrors index.ts) ──────────────────────────────────────────

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);

function getExpenseNotificationContent(
  oldStatus: string,
  newStatus: string,
  record: ExpenseRecord,
  appUrl: string
): NotificationResult {
  const { title, amount, ministryName, reviewerName, reviewerNotes, paymentReference } = record;
  const amountStr = formatCurrency(amount);

  const isRecall = oldStatus === "leader_approved" && newStatus === "pending_leader";

  if (isRecall) {
    return {
      requesterContent: {
        subject: `Expense Update: ${title}`,
        heading: "Expense Approval Recalled",
        message: `The approval for your expense request "${title}" (${amountStr}) has been recalled. It has been reverted to pending review.`,
        statusColor: "#f59e0b",
        statusBadge: "APPROVAL RECALLED",
        amount,
        reviewerNotes: reviewerNotes ?? undefined,
        showActionButton: false,
        actionButtonText: "",
      },
      reviewerContent: null,
      reviewerRole: null,
    };
  }

  switch (newStatus) {
    case "pending_leader":
      return {
        requesterContent: {
          subject: `Expense Submitted: ${title}`,
          heading: "Your Expense Request Has Been Submitted",
          message: `Your expense request for "${title}" (${amountStr}) has been submitted for review. You will be notified once it is reviewed.`,
          statusColor: "#3b82f6",
          statusBadge: "SUBMITTED",
          amount,
          showActionButton: false,
          actionButtonText: "",
        },
        reviewerContent: {
          subject: `New Expense Request: ${title}`,
          heading: "New Expense Request Pending Your Review",
          message: `${record.requesterName} from ${ministryName} has submitted an expense request for "${title}" (${amountStr}). This request requires your review and approval.`,
          statusColor: "#f59e0b",
          statusBadge: "PENDING REVIEW",
          amount,
          showActionButton: true,
          actionButtonText: "Review Request",
          actionUrl: `${appUrl}/budget`,
        },
        reviewerRole: "admin",
      };

    case "leader_approved":
      return {
        requesterContent: {
          subject: `Expense Approved: ${title}`,
          heading: "Your Expense Request Has Been Approved",
          message: `Great news! Your expense request for "${title}" (${amountStr}) has been approved by ${reviewerName || "the reviewer"}. It will now proceed to treasury for payment approval.`,
          statusColor: "#22c55e",
          statusBadge: "LEADER APPROVED",
          amount,
          reviewerNotes: reviewerNotes ?? undefined,
          showActionButton: false,
          actionButtonText: "",
        },
        reviewerContent: {
          subject: `Expense Awaiting Payment Approval: ${title}`,
          heading: "New Expense Awaiting Payment Approval",
          message: `An expense request for "${title}" (${amountStr}) from ${ministryName} has been approved by the leader and requires your payment approval.`,
          statusColor: "#8b5cf6",
          statusBadge: "AWAITING TREASURY",
          amount,
          showActionButton: true,
          actionButtonText: "Review Payment",
          actionUrl: `${appUrl}/budget`,
        },
        reviewerRole: "treasury",
      };

    case "leader_denied":
      return {
        requesterContent: {
          subject: `Expense Denied: ${title}`,
          heading: "Expense Request Update",
          message: `Your expense request for "${title}" (${amountStr}) was not approved by ${reviewerName || "the reviewer"}. Please review the notes below for more information.`,
          statusColor: "#ef4444",
          statusBadge: "DENIED",
          amount,
          reviewerNotes: reviewerNotes ?? undefined,
          showActionButton: false,
          actionButtonText: "",
        },
        reviewerContent: null,
        reviewerRole: null,
      };

    case "treasury_approved":
      return {
        requesterContent: {
          subject: `Payment Approved: ${title}`,
          heading: "Payment Has Been Approved",
          message: `The payment for "${title}" (${amountStr}) has been approved by treasury. The finance team will process your payment shortly.`,
          statusColor: "#3b82f6",
          statusBadge: "PAYMENT APPROVED",
          amount,
          reviewerNotes: reviewerNotes ?? undefined,
          showActionButton: false,
          actionButtonText: "",
        },
        reviewerContent: {
          subject: `Payment Ready to Process: ${title}`,
          heading: "New Payment Ready to Process",
          message: `The payment for "${title}" (${amountStr}) from ${ministryName} has been approved by treasury and is ready for processing.`,
          statusColor: "#8b5cf6",
          statusBadge: "AWAITING FINANCE",
          amount,
          showActionButton: true,
          actionButtonText: "Process Payment",
          actionUrl: `${appUrl}/budget`,
        },
        reviewerRole: "finance",
      };

    case "treasury_denied":
      return {
        requesterContent: {
          subject: `Payment Denied: ${title}`,
          heading: "Payment Request Update",
          message: `The payment for "${title}" (${amountStr}) was not approved by treasury. Please review the notes below.`,
          statusColor: "#ef4444",
          statusBadge: "PAYMENT DENIED",
          amount,
          reviewerNotes: reviewerNotes ?? undefined,
          showActionButton: false,
          actionButtonText: "",
        },
        reviewerContent: null,
        reviewerRole: null,
      };

    case "completed":
      return {
        requesterContent: {
          subject: `Payment Complete: ${title}`,
          heading: "Your Payment Has Been Processed",
          message: `Your expense request for "${title}" (${amountStr}) has been fully processed. Payment reference: ${paymentReference || "N/A"}.`,
          statusColor: "#22c55e",
          statusBadge: "COMPLETED",
          amount,
          reviewerNotes: reviewerNotes ?? undefined,
          showActionButton: false,
          actionButtonText: "",
        },
        reviewerContent: null,
        reviewerRole: null,
      };

    case "cancelled":
      return {
        requesterContent: {
          subject: `Expense Cancelled: ${title}`,
          heading: "Expense Request Cancelled",
          message: `The expense request for "${title}" (${amountStr}) has been cancelled.`,
          statusColor: "#6b7280",
          statusBadge: "CANCELLED",
          amount,
          showActionButton: false,
          actionButtonText: "",
        },
        reviewerContent: null,
        reviewerRole: null,
      };

    default:
      return { requesterContent: null, reviewerContent: null, reviewerRole: null };
  }
}

function getAllocationNotificationContent(
  oldStatus: string,
  newStatus: string,
  record: AllocationRecord,
  appUrl: string
): NotificationResult {
  const { ministryName, requestedAmount, approvedAmount, adminNotes } = record;
  const amountStr = formatCurrency(approvedAmount || requestedAmount);

  const isRecall = oldStatus === "approved" && newStatus === "pending";

  if (isRecall) {
    return {
      requesterContent: {
        subject: `Budget Allocation Update: ${ministryName}`,
        heading: "Budget Allocation Approval Recalled",
        message: `The approval for your budget allocation request for ${ministryName} (${amountStr}) has been recalled. It has been reverted to pending review.`,
        statusColor: "#f59e0b",
        statusBadge: "APPROVAL RECALLED",
        amount: approvedAmount || requestedAmount,
        reviewerNotes: adminNotes || undefined,
        showActionButton: false,
        actionButtonText: "",
      },
      reviewerContent: null,
      reviewerRole: null,
    };
  }

  switch (newStatus) {
    case "pending":
      return {
        requesterContent: null,
        reviewerContent: {
          subject: `New Budget Request: ${ministryName}`,
          heading: "New Budget Request",
          message: `${record.requesterName} from ${ministryName} has submitted a budget request for ${formatCurrency(requestedAmount)}. This request requires your review.`,
          statusColor: "#8b5cf6",
          statusBadge: "PENDING REVIEW",
          amount: requestedAmount,
          showActionButton: true,
          actionButtonText: "Review Request",
          actionUrl: `${appUrl}/budget`,
        },
        reviewerRole: "admin",
      };

    case "approved":
    case "partially_approved":
      return {
        requesterContent: {
          subject: `Budget Allocation Approved: ${ministryName}`,
          heading: "Budget Allocation Approved",
          message: `Your budget allocation request for ${ministryName} (${amountStr}) has been approved.`,
          statusColor: "#22c55e",
          statusBadge: "APPROVED",
          amount: approvedAmount || requestedAmount,
          reviewerNotes: adminNotes || undefined,
          showActionButton: false,
          actionButtonText: "",
        },
        reviewerContent: null,
        reviewerRole: null,
      };

    case "denied":
      return {
        requesterContent: {
          subject: `Budget Allocation Denied: ${ministryName}`,
          heading: "Budget Allocation Update",
          message: `Your budget allocation request for ${ministryName} (${formatCurrency(requestedAmount)}) was not approved. Please review the notes below.`,
          statusColor: "#ef4444",
          statusBadge: "DENIED",
          amount: requestedAmount,
          reviewerNotes: adminNotes || undefined,
          showActionButton: false,
          actionButtonText: "",
        },
        reviewerContent: null,
        reviewerRole: null,
      };

    case "cancelled":
      return {
        requesterContent: {
          subject: `Budget Allocation Cancelled: ${ministryName}`,
          heading: "Budget Allocation Cancelled",
          message: `The budget allocation request for ${ministryName} (${formatCurrency(requestedAmount)}) has been cancelled.`,
          statusColor: "#6b7280",
          statusBadge: "CANCELLED",
          amount: requestedAmount,
          showActionButton: false,
          actionButtonText: "",
        },
        reviewerContent: null,
        reviewerRole: null,
      };

    default:
      return { requesterContent: null, reviewerContent: null, reviewerRole: null };
  }
}

function buildEmailHtml(
  recipientName: string,
  content: EmailContent,
  config: { churchName: string; churchLogoUrl: string }
): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head><title>${content.subject}</title></head>
<body>
  <h1>${content.heading}</h1>
  <p>${config.churchName}</p>
  <img src="${config.churchLogoUrl}" alt="${config.churchName}" />
  <div style="background-color: ${content.statusColor};">${content.statusBadge}</div>
  <p>Hello ${recipientName},</p>
  <p>${content.message}</p>
  ${content.amount ? `<p>${formatCurrency(content.amount)}</p>` : ""}
  ${content.reviewerNotes ? `<h4>Notes from Reviewer</h4><p>${content.reviewerNotes}</p>` : ""}
  ${content.showActionButton && content.actionUrl ? `<a href="${content.actionUrl}" style="display: inline-block; background-color: #10b981; color: #ffffff;">${content.actionButtonText}</a>` : ""}
</body>
</html>`;
}

// ─── Test Fixtures ───────────────────────────────────────────────────────────

const APP_URL = "https://app.addislidet.info";

const mockExpenseRecord: ExpenseRecord = {
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

const mockAllocationRecord: AllocationRecord = {
  id: "alloc-001",
  ministryName: "Worship Ministry",
  organizationId: "org-001",
  requesterName: "Alice Johnson",
  requesterEmail: "alice@example.com",
  requestedAmount: 2000,
  approvedAmount: 1500,
  adminNotes: "Partially approved due to budget constraints.",
};

const mockEmailConfig = {
  churchName: "Test Church",
  churchLogoUrl: "https://example.com/logo.png",
};

// ═════════════════════════════════════════════════════════════════════════════
// TESTS
// ═════════════════════════════════════════════════════════════════════════════

// ─── formatCurrency ──────────────────────────────────────────────────────────

describe("formatCurrency", () => {
  it("formats whole dollar amounts", () => {
    expect(formatCurrency(500)).toBe("$500.00");
  });

  it("formats amounts with cents", () => {
    expect(formatCurrency(1234.56)).toBe("$1,234.56");
  });

  it("formats zero", () => {
    expect(formatCurrency(0)).toBe("$0.00");
  });

  it("formats large amounts with commas", () => {
    expect(formatCurrency(100000)).toBe("$100,000.00");
  });
});

// ─── Expense Notification Flows ──────────────────────────────────────────────

describe("getExpenseNotificationContent", () => {
  // ── Flow 1: draft → pending_leader ──────────────────────────────────────
  describe("draft → pending_leader (submit)", () => {
    const result = getExpenseNotificationContent("draft", "pending_leader", mockExpenseRecord, APP_URL);

    it("sends requester a 'submitted' email", () => {
      expect(result.requesterContent).not.toBeNull();
      expect(result.requesterContent!.subject).toContain("Submitted");
      expect(result.requesterContent!.statusBadge).toBe("SUBMITTED");
      expect(result.requesterContent!.statusColor).toBe("#3b82f6");
      expect(result.requesterContent!.message).toContain("submitted for review");
      expect(result.requesterContent!.amount).toBe(500);
      expect(result.requesterContent!.showActionButton).toBe(false);
    });

    it("sends admins a 'new expense to review' email", () => {
      expect(result.reviewerContent).not.toBeNull();
      expect(result.reviewerContent!.subject).toContain("New Expense Request");
      expect(result.reviewerContent!.statusBadge).toBe("PENDING REVIEW");
      expect(result.reviewerContent!.message).toContain("John Doe");
      expect(result.reviewerContent!.message).toContain("Youth Ministry");
      expect(result.reviewerContent!.showActionButton).toBe(true);
      expect(result.reviewerContent!.actionButtonText).toBe("Review Request");
      expect(result.reviewerContent!.actionUrl).toBe(`${APP_URL}/budget`);
    });

    it("targets admin role for reviewers", () => {
      expect(result.reviewerRole).toBe("admin");
    });
  });

  // ── Flow 2: pending_leader → leader_approved ────────────────────────────
  describe("pending_leader → leader_approved", () => {
    const result = getExpenseNotificationContent("pending_leader", "leader_approved", mockExpenseRecord, APP_URL);

    it("sends requester an 'approved' email", () => {
      expect(result.requesterContent).not.toBeNull();
      expect(result.requesterContent!.subject).toContain("Approved");
      expect(result.requesterContent!.statusBadge).toBe("LEADER APPROVED");
      expect(result.requesterContent!.statusColor).toBe("#22c55e");
      expect(result.requesterContent!.message).toContain("approved by Jane Smith");
      expect(result.requesterContent!.message).toContain("treasury");
    });

    it("sends treasury an 'awaiting payment approval' email", () => {
      expect(result.reviewerContent).not.toBeNull();
      expect(result.reviewerContent!.subject).toContain("Awaiting Payment Approval");
      expect(result.reviewerContent!.statusBadge).toBe("AWAITING TREASURY");
      expect(result.reviewerContent!.message).toContain("approved by the leader");
      expect(result.reviewerContent!.showActionButton).toBe(true);
      expect(result.reviewerContent!.actionButtonText).toBe("Review Payment");
    });

    it("targets treasury role for reviewers", () => {
      expect(result.reviewerRole).toBe("treasury");
    });
  });

  // ── Flow 3: pending_leader → leader_denied ──────────────────────────────
  describe("pending_leader → leader_denied", () => {
    const result = getExpenseNotificationContent("pending_leader", "leader_denied", mockExpenseRecord, APP_URL);

    it("sends requester a 'denied' email", () => {
      expect(result.requesterContent).not.toBeNull();
      expect(result.requesterContent!.subject).toContain("Denied");
      expect(result.requesterContent!.statusBadge).toBe("DENIED");
      expect(result.requesterContent!.statusColor).toBe("#ef4444");
      expect(result.requesterContent!.message).toContain("not approved");
      expect(result.requesterContent!.reviewerNotes).toBe("Looks good, approved.");
    });

    it("does NOT send reviewer email", () => {
      expect(result.reviewerContent).toBeNull();
      expect(result.reviewerRole).toBeNull();
    });
  });

  // ── Flow 4: leader_approved → pending_leader (recall) ──────────────────
  describe("leader_approved → pending_leader (recall)", () => {
    const result = getExpenseNotificationContent("leader_approved", "pending_leader", mockExpenseRecord, APP_URL);

    it("sends requester a 'recalled' email", () => {
      expect(result.requesterContent).not.toBeNull();
      expect(result.requesterContent!.subject).toContain("Update");
      expect(result.requesterContent!.statusBadge).toBe("APPROVAL RECALLED");
      expect(result.requesterContent!.statusColor).toBe("#f59e0b");
      expect(result.requesterContent!.message).toContain("recalled");
      expect(result.requesterContent!.message).toContain("reverted to pending");
    });

    it("does NOT send reviewer email (recall only notifies requester)", () => {
      expect(result.reviewerContent).toBeNull();
      expect(result.reviewerRole).toBeNull();
    });
  });

  // ── Flow 5: leader_approved → treasury_approved ─────────────────────────
  describe("leader_approved → treasury_approved", () => {
    const result = getExpenseNotificationContent("leader_approved", "treasury_approved", mockExpenseRecord, APP_URL);

    it("sends requester a 'payment approved' email", () => {
      expect(result.requesterContent).not.toBeNull();
      expect(result.requesterContent!.subject).toContain("Payment Approved");
      expect(result.requesterContent!.statusBadge).toBe("PAYMENT APPROVED");
      expect(result.requesterContent!.message).toContain("approved by treasury");
      expect(result.requesterContent!.message).toContain("finance team");
    });

    it("sends finance a 'ready to process' email", () => {
      expect(result.reviewerContent).not.toBeNull();
      expect(result.reviewerContent!.subject).toContain("Ready to Process");
      expect(result.reviewerContent!.statusBadge).toBe("AWAITING FINANCE");
      expect(result.reviewerContent!.showActionButton).toBe(true);
      expect(result.reviewerContent!.actionButtonText).toBe("Process Payment");
    });

    it("targets finance role for reviewers", () => {
      expect(result.reviewerRole).toBe("finance");
    });
  });

  // ── Flow 6: leader_approved → treasury_denied ───────────────────────────
  describe("leader_approved → treasury_denied", () => {
    const result = getExpenseNotificationContent("leader_approved", "treasury_denied", mockExpenseRecord, APP_URL);

    it("sends requester a 'payment denied' email", () => {
      expect(result.requesterContent).not.toBeNull();
      expect(result.requesterContent!.subject).toContain("Payment Denied");
      expect(result.requesterContent!.statusBadge).toBe("PAYMENT DENIED");
      expect(result.requesterContent!.statusColor).toBe("#ef4444");
    });

    it("does NOT send reviewer email", () => {
      expect(result.reviewerContent).toBeNull();
      expect(result.reviewerRole).toBeNull();
    });
  });

  // ── Flow 7: treasury_approved → completed ───────────────────────────────
  describe("treasury_approved → completed", () => {
    const result = getExpenseNotificationContent("treasury_approved", "completed", mockExpenseRecord, APP_URL);

    it("sends requester a 'payment complete' email with reference", () => {
      expect(result.requesterContent).not.toBeNull();
      expect(result.requesterContent!.subject).toContain("Payment Complete");
      expect(result.requesterContent!.statusBadge).toBe("COMPLETED");
      expect(result.requesterContent!.statusColor).toBe("#22c55e");
      expect(result.requesterContent!.message).toContain("PAY-12345");
    });

    it("does NOT send reviewer email", () => {
      expect(result.reviewerContent).toBeNull();
      expect(result.reviewerRole).toBeNull();
    });
  });

  // ── Flow 8: * → cancelled ──────────────────────────────────────────────
  describe("* → cancelled", () => {
    const result = getExpenseNotificationContent("pending_leader", "cancelled", mockExpenseRecord, APP_URL);

    it("sends requester a 'cancelled' email", () => {
      expect(result.requesterContent).not.toBeNull();
      expect(result.requesterContent!.subject).toContain("Cancelled");
      expect(result.requesterContent!.statusBadge).toBe("CANCELLED");
      expect(result.requesterContent!.statusColor).toBe("#6b7280");
    });

    it("does NOT send reviewer email", () => {
      expect(result.reviewerContent).toBeNull();
      expect(result.reviewerRole).toBeNull();
    });
  });

  // ── Edge: unknown transition returns null ──────────────────────────────
  describe("unknown transition", () => {
    const result = getExpenseNotificationContent("draft", "some_unknown_status", mockExpenseRecord, APP_URL);

    it("returns null for all content", () => {
      expect(result.requesterContent).toBeNull();
      expect(result.reviewerContent).toBeNull();
      expect(result.reviewerRole).toBeNull();
    });
  });

  // ── Edge: reviewer name fallback ──────────────────────────────────────
  describe("reviewer name fallback", () => {
    const recordNoReviewer: ExpenseRecord = { ...mockExpenseRecord, reviewerName: null };

    it("uses 'the reviewer' when reviewerName is null", () => {
      const result = getExpenseNotificationContent("pending_leader", "leader_approved", recordNoReviewer, APP_URL);
      expect(result.requesterContent!.message).toContain("approved by the reviewer");
    });
  });

  // ── Edge: completed without payment reference ─────────────────────────
  describe("completed without payment reference", () => {
    const recordNoRef: ExpenseRecord = { ...mockExpenseRecord, paymentReference: null };

    it("shows N/A for payment reference", () => {
      const result = getExpenseNotificationContent("treasury_approved", "completed", recordNoRef, APP_URL);
      expect(result.requesterContent!.message).toContain("N/A");
    });
  });
});

// ─── Allocation Notification Flows ───────────────────────────────────────────

describe("getAllocationNotificationContent", () => {
  // ── Flow 9: draft → pending ────────────────────────────────────────────
  describe("draft → pending (submit)", () => {
    const result = getAllocationNotificationContent("draft", "pending", mockAllocationRecord, APP_URL);

    it("does NOT send requester email (submit only notifies admins)", () => {
      expect(result.requesterContent).toBeNull();
    });

    it("sends admins a 'new budget request' email", () => {
      expect(result.reviewerContent).not.toBeNull();
      expect(result.reviewerContent!.subject).toContain("New Budget Request");
      expect(result.reviewerContent!.statusBadge).toBe("PENDING REVIEW");
      expect(result.reviewerContent!.message).toContain("Alice Johnson");
      expect(result.reviewerContent!.message).toContain("Worship Ministry");
      expect(result.reviewerContent!.message).toContain("$2,000.00");
      expect(result.reviewerContent!.showActionButton).toBe(true);
      expect(result.reviewerContent!.actionButtonText).toBe("Review Request");
      expect(result.reviewerContent!.actionUrl).toBe(`${APP_URL}/budget`);
    });

    it("targets admin role for reviewers", () => {
      expect(result.reviewerRole).toBe("admin");
    });
  });

  // ── Flow 10: pending → approved ────────────────────────────────────────
  describe("pending → approved", () => {
    const result = getAllocationNotificationContent("pending", "approved", mockAllocationRecord, APP_URL);

    it("sends requester an 'approved' email", () => {
      expect(result.requesterContent).not.toBeNull();
      expect(result.requesterContent!.subject).toContain("Approved");
      expect(result.requesterContent!.statusBadge).toBe("APPROVED");
      expect(result.requesterContent!.statusColor).toBe("#22c55e");
      expect(result.requesterContent!.message).toContain("Worship Ministry");
      expect(result.requesterContent!.amount).toBe(1500);
    });

    it("does NOT send reviewer email", () => {
      expect(result.reviewerContent).toBeNull();
      expect(result.reviewerRole).toBeNull();
    });
  });

  // ── Flow 10b: pending → partially_approved ────────────────────────────
  describe("pending → partially_approved", () => {
    const result = getAllocationNotificationContent("pending", "partially_approved", mockAllocationRecord, APP_URL);

    it("sends requester an 'approved' email (same as full approval)", () => {
      expect(result.requesterContent).not.toBeNull();
      expect(result.requesterContent!.subject).toContain("Approved");
      expect(result.requesterContent!.statusBadge).toBe("APPROVED");
      expect(result.requesterContent!.reviewerNotes).toBe("Partially approved due to budget constraints.");
    });
  });

  // ── Flow 11: pending → denied ──────────────────────────────────────────
  describe("pending → denied", () => {
    const result = getAllocationNotificationContent("pending", "denied", mockAllocationRecord, APP_URL);

    it("sends requester a 'denied' email", () => {
      expect(result.requesterContent).not.toBeNull();
      expect(result.requesterContent!.subject).toContain("Denied");
      expect(result.requesterContent!.statusBadge).toBe("DENIED");
      expect(result.requesterContent!.statusColor).toBe("#ef4444");
      expect(result.requesterContent!.message).toContain("not approved");
      expect(result.requesterContent!.amount).toBe(2000);
    });

    it("does NOT send reviewer email", () => {
      expect(result.reviewerContent).toBeNull();
      expect(result.reviewerRole).toBeNull();
    });
  });

  // ── Flow 12: approved → pending (recall) ───────────────────────────────
  describe("approved → pending (recall)", () => {
    const result = getAllocationNotificationContent("approved", "pending", mockAllocationRecord, APP_URL);

    it("sends requester a 'recalled' email", () => {
      expect(result.requesterContent).not.toBeNull();
      expect(result.requesterContent!.subject).toContain("Update");
      expect(result.requesterContent!.statusBadge).toBe("APPROVAL RECALLED");
      expect(result.requesterContent!.statusColor).toBe("#f59e0b");
      expect(result.requesterContent!.message).toContain("recalled");
      expect(result.requesterContent!.message).toContain("reverted to pending");
    });

    it("does NOT send reviewer email", () => {
      expect(result.reviewerContent).toBeNull();
      expect(result.reviewerRole).toBeNull();
    });
  });

  // ── Flow 13: * → cancelled ────────────────────────────────────────────
  describe("* → cancelled", () => {
    const result = getAllocationNotificationContent("pending", "cancelled", mockAllocationRecord, APP_URL);

    it("sends requester a 'cancelled' email", () => {
      expect(result.requesterContent).not.toBeNull();
      expect(result.requesterContent!.subject).toContain("Cancelled");
      expect(result.requesterContent!.statusBadge).toBe("CANCELLED");
      expect(result.requesterContent!.statusColor).toBe("#6b7280");
    });

    it("does NOT send reviewer email", () => {
      expect(result.reviewerContent).toBeNull();
      expect(result.reviewerRole).toBeNull();
    });
  });

  // ── Edge: unknown transition returns null ──────────────────────────────
  describe("unknown transition", () => {
    const result = getAllocationNotificationContent("draft", "some_unknown_status", mockAllocationRecord, APP_URL);

    it("returns null for all content", () => {
      expect(result.requesterContent).toBeNull();
      expect(result.reviewerContent).toBeNull();
      expect(result.reviewerRole).toBeNull();
    });
  });

  // ── Edge: allocation with no approvedAmount ────────────────────────────
  describe("approved with no approvedAmount", () => {
    const recordNoApproved: AllocationRecord = { ...mockAllocationRecord, approvedAmount: null };

    it("falls back to requestedAmount", () => {
      const result = getAllocationNotificationContent("pending", "approved", recordNoApproved, APP_URL);
      expect(result.requesterContent!.amount).toBe(2000);
    });
  });
});

// ─── Email Coverage Matrix ───────────────────────────────────────────────────

describe("Full Email Coverage Matrix", () => {
  describe("Expense Requests — all 8 transitions produce correct email targets", () => {
    const transitions = [
      { name: "submit", oldStatus: "draft", newStatus: "pending_leader", expectRequester: true, expectReviewer: true, expectedRole: "admin" },
      { name: "leader approve", oldStatus: "pending_leader", newStatus: "leader_approved", expectRequester: true, expectReviewer: true, expectedRole: "treasury" },
      { name: "leader deny", oldStatus: "pending_leader", newStatus: "leader_denied", expectRequester: true, expectReviewer: false, expectedRole: null },
      { name: "recall", oldStatus: "leader_approved", newStatus: "pending_leader", expectRequester: true, expectReviewer: false, expectedRole: null },
      { name: "treasury approve", oldStatus: "leader_approved", newStatus: "treasury_approved", expectRequester: true, expectReviewer: true, expectedRole: "finance" },
      { name: "treasury deny", oldStatus: "leader_approved", newStatus: "treasury_denied", expectRequester: true, expectReviewer: false, expectedRole: null },
      { name: "complete", oldStatus: "treasury_approved", newStatus: "completed", expectRequester: true, expectReviewer: false, expectedRole: null },
      { name: "cancel", oldStatus: "pending_leader", newStatus: "cancelled", expectRequester: true, expectReviewer: false, expectedRole: null },
    ];

    for (const t of transitions) {
      it(`[${t.name}] ${t.oldStatus} → ${t.newStatus}: requester=${t.expectRequester}, reviewer=${t.expectReviewer}${t.expectedRole ? ` (${t.expectedRole})` : ""}`, () => {
        const result = getExpenseNotificationContent(t.oldStatus, t.newStatus, mockExpenseRecord, APP_URL);
        if (t.expectRequester) {
          expect(result.requesterContent).not.toBeNull();
        } else {
          expect(result.requesterContent).toBeNull();
        }
        if (t.expectReviewer) {
          expect(result.reviewerContent).not.toBeNull();
          expect(result.reviewerRole).toBe(t.expectedRole);
        } else {
          expect(result.reviewerContent).toBeNull();
          expect(result.reviewerRole).toBeNull();
        }
      });
    }
  });

  describe("Allocation Requests — all 6 transitions produce correct email targets", () => {
    const transitions = [
      { name: "submit", oldStatus: "draft", newStatus: "pending", expectRequester: false, expectReviewer: true, expectedRole: "admin" },
      { name: "approve", oldStatus: "pending", newStatus: "approved", expectRequester: true, expectReviewer: false, expectedRole: null },
      { name: "partially approve", oldStatus: "pending", newStatus: "partially_approved", expectRequester: true, expectReviewer: false, expectedRole: null },
      { name: "deny", oldStatus: "pending", newStatus: "denied", expectRequester: true, expectReviewer: false, expectedRole: null },
      { name: "recall", oldStatus: "approved", newStatus: "pending", expectRequester: true, expectReviewer: false, expectedRole: null },
      { name: "cancel", oldStatus: "pending", newStatus: "cancelled", expectRequester: true, expectReviewer: false, expectedRole: null },
    ];

    for (const t of transitions) {
      it(`[${t.name}] ${t.oldStatus} → ${t.newStatus}: requester=${t.expectRequester}, reviewer=${t.expectReviewer}${t.expectedRole ? ` (${t.expectedRole})` : ""}`, () => {
        const result = getAllocationNotificationContent(t.oldStatus, t.newStatus, mockAllocationRecord, APP_URL);
        if (t.expectRequester) {
          expect(result.requesterContent).not.toBeNull();
        } else {
          expect(result.requesterContent).toBeNull();
        }
        if (t.expectReviewer) {
          expect(result.reviewerContent).not.toBeNull();
          expect(result.reviewerRole).toBe(t.expectedRole);
        } else {
          expect(result.reviewerContent).toBeNull();
          expect(result.reviewerRole).toBeNull();
        }
      });
    }
  });
});

// ─── buildEmailHtml ──────────────────────────────────────────────────────────

describe("buildEmailHtml", () => {
  it("includes recipient name in greeting", () => {
    const content = getExpenseNotificationContent("draft", "pending_leader", mockExpenseRecord, APP_URL);
    const html = buildEmailHtml("John Doe", content.requesterContent!, mockEmailConfig);
    expect(html).toContain("Hello John Doe");
  });

  it("includes church name", () => {
    const content = getExpenseNotificationContent("draft", "pending_leader", mockExpenseRecord, APP_URL);
    const html = buildEmailHtml("John", content.requesterContent!, mockEmailConfig);
    expect(html).toContain("Test Church");
  });

  it("includes church logo URL", () => {
    const content = getExpenseNotificationContent("draft", "pending_leader", mockExpenseRecord, APP_URL);
    const html = buildEmailHtml("John", content.requesterContent!, mockEmailConfig);
    expect(html).toContain("https://example.com/logo.png");
  });

  it("includes status badge with correct color", () => {
    const content = getExpenseNotificationContent("pending_leader", "leader_approved", mockExpenseRecord, APP_URL);
    const html = buildEmailHtml("John", content.requesterContent!, mockEmailConfig);
    expect(html).toContain("LEADER APPROVED");
    expect(html).toContain("#22c55e");
  });

  it("includes amount display when amount is present", () => {
    const content = getExpenseNotificationContent("draft", "pending_leader", mockExpenseRecord, APP_URL);
    const html = buildEmailHtml("John", content.requesterContent!, mockEmailConfig);
    expect(html).toContain("$500.00");
  });

  it("includes reviewer notes when present", () => {
    const content = getExpenseNotificationContent("pending_leader", "leader_denied", mockExpenseRecord, APP_URL);
    const html = buildEmailHtml("John", content.requesterContent!, mockEmailConfig);
    expect(html).toContain("Notes from Reviewer");
    expect(html).toContain("Looks good, approved.");
  });

  it("includes action button for reviewer emails", () => {
    const content = getExpenseNotificationContent("draft", "pending_leader", mockExpenseRecord, APP_URL);
    const html = buildEmailHtml("Admin", content.reviewerContent!, mockEmailConfig);
    expect(html).toContain("Review Request");
    expect(html).toContain(`${APP_URL}/budget`);
  });

  it("omits action button for requester emails", () => {
    const content = getExpenseNotificationContent("pending_leader", "leader_denied", mockExpenseRecord, APP_URL);
    const html = buildEmailHtml("John", content.requesterContent!, mockEmailConfig);
    expect(html).not.toContain('style="display: inline-block; background-color: #10b981');
  });

  it("produces valid HTML document", () => {
    const content = getExpenseNotificationContent("draft", "pending_leader", mockExpenseRecord, APP_URL);
    const html = buildEmailHtml("John", content.requesterContent!, mockEmailConfig);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<html");
    expect(html).toContain("</html>");
  });
});

// ─── Total Email Count Verification ──────────────────────────────────────────

describe("Total email send count across all flows", () => {
  it("produces exactly 17 email types across all transitions", () => {
    let totalEmails = 0;

    const expenseTransitions = [
      ["draft", "pending_leader"],
      ["pending_leader", "leader_approved"],
      ["pending_leader", "leader_denied"],
      ["leader_approved", "pending_leader"],
      ["leader_approved", "treasury_approved"],
      ["leader_approved", "treasury_denied"],
      ["treasury_approved", "completed"],
      ["pending_leader", "cancelled"],
    ] as const;

    for (const [old_s, new_s] of expenseTransitions) {
      const result = getExpenseNotificationContent(old_s, new_s, mockExpenseRecord, APP_URL);
      if (result.requesterContent) totalEmails++;
      if (result.reviewerContent) totalEmails++;
    }

    const allocationTransitions = [
      ["draft", "pending"],
      ["pending", "approved"],
      ["pending", "partially_approved"],
      ["pending", "denied"],
      ["approved", "pending"],
      ["pending", "cancelled"],
    ] as const;

    for (const [old_s, new_s] of allocationTransitions) {
      const result = getAllocationNotificationContent(old_s, new_s, mockAllocationRecord, APP_URL);
      if (result.requesterContent) totalEmails++;
      if (result.reviewerContent) totalEmails++;
    }

    // 8 expense requester + 3 expense reviewer + 5 allocation requester + 1 allocation reviewer = 17
    expect(totalEmails).toBe(17);
  });
});
