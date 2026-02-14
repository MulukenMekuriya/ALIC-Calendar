/**
 * Budget Notification Service
 * Handles sending email notifications for budget-related events
 */

import { supabase } from "@/integrations/supabase/client";

type NotificationType =
  | "expense_submitted"
  | "expense_leader_approved"
  | "expense_leader_denied"
  | "expense_approval_recalled"
  | "expense_treasury_approved"
  | "expense_treasury_denied"
  | "expense_completed"
  | "expense_cancelled"
  | "allocation_submitted"
  | "allocation_approved"
  | "allocation_denied"
  | "allocation_approval_recalled"
  | "budget_alert";

interface NotificationPayload {
  to: string;
  recipientName: string;
  notificationType: NotificationType;
  expenseTitle?: string;
  expenseAmount?: number;
  ministryName?: string;
  requesterName?: string;
  reviewerName?: string;
  reviewerNotes?: string;
  paymentReference?: string;
  alertMessage?: string;
  actionUrl?: string;
}

interface NotificationResult {
  success: boolean;
  error?: string;
}

/**
 * Send a budget notification email
 */
export const sendBudgetNotification = async (
  payload: NotificationPayload
): Promise<NotificationResult> => {
  try {
    const { data, error } = await supabase.functions.invoke("send-budget-notification", {
      body: payload,
    });

    if (error) {
      console.error("Failed to send budget notification:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error("Error sending budget notification:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
};

// =====================================================
// Expense Notification Helpers
// =====================================================

interface ExpenseNotificationContext {
  expenseTitle: string;
  expenseAmount: number;
  ministryName: string;
  requesterName: string;
  requesterEmail: string;
}

/**
 * Notify requester that their expense was approved by leader
 */
export const notifyExpenseLeaderApproved = async (
  context: ExpenseNotificationContext,
  reviewerName: string,
  reviewerNotes?: string
): Promise<NotificationResult> => {
  return sendBudgetNotification({
    to: context.requesterEmail,
    recipientName: context.requesterName,
    notificationType: "expense_leader_approved",
    expenseTitle: context.expenseTitle,
    expenseAmount: context.expenseAmount,
    ministryName: context.ministryName,
    requesterName: context.requesterName,
    reviewerName,
    reviewerNotes,
  });
};

/**
 * Notify requester that their expense was denied by leader
 */
export const notifyExpenseLeaderDenied = async (
  context: ExpenseNotificationContext,
  reviewerName: string,
  reviewerNotes: string
): Promise<NotificationResult> => {
  return sendBudgetNotification({
    to: context.requesterEmail,
    recipientName: context.requesterName,
    notificationType: "expense_leader_denied",
    expenseTitle: context.expenseTitle,
    expenseAmount: context.expenseAmount,
    ministryName: context.ministryName,
    requesterName: context.requesterName,
    reviewerName,
    reviewerNotes,
  });
};

/**
 * Notify requester that their expense approval was recalled by admin
 */
export const notifyExpenseApprovalRecalled = async (
  context: ExpenseNotificationContext,
  reviewerName: string,
  reviewerNotes: string
): Promise<NotificationResult> => {
  return sendBudgetNotification({
    to: context.requesterEmail,
    recipientName: context.requesterName,
    notificationType: "expense_approval_recalled",
    expenseTitle: context.expenseTitle,
    expenseAmount: context.expenseAmount,
    ministryName: context.ministryName,
    requesterName: context.requesterName,
    reviewerName,
    reviewerNotes,
  });
};

/**
 * Notify requester that payment was approved by treasury
 */
export const notifyExpenseTreasuryApproved = async (
  context: ExpenseNotificationContext,
  reviewerName: string,
  reviewerNotes?: string
): Promise<NotificationResult> => {
  return sendBudgetNotification({
    to: context.requesterEmail,
    recipientName: context.requesterName,
    notificationType: "expense_treasury_approved",
    expenseTitle: context.expenseTitle,
    expenseAmount: context.expenseAmount,
    ministryName: context.ministryName,
    requesterName: context.requesterName,
    reviewerName,
    reviewerNotes,
  });
};

/**
 * Notify requester that payment was denied by treasury
 */
export const notifyExpenseTreasuryDenied = async (
  context: ExpenseNotificationContext,
  reviewerName: string,
  reviewerNotes: string
): Promise<NotificationResult> => {
  return sendBudgetNotification({
    to: context.requesterEmail,
    recipientName: context.requesterName,
    notificationType: "expense_treasury_denied",
    expenseTitle: context.expenseTitle,
    expenseAmount: context.expenseAmount,
    ministryName: context.ministryName,
    requesterName: context.requesterName,
    reviewerName,
    reviewerNotes,
  });
};

/**
 * Notify requester that their expense has been paid
 */
export const notifyExpenseCompleted = async (
  context: ExpenseNotificationContext,
  paymentReference: string,
  processorNotes?: string
): Promise<NotificationResult> => {
  return sendBudgetNotification({
    to: context.requesterEmail,
    recipientName: context.requesterName,
    notificationType: "expense_completed",
    expenseTitle: context.expenseTitle,
    expenseAmount: context.expenseAmount,
    ministryName: context.ministryName,
    requesterName: context.requesterName,
    paymentReference,
    reviewerNotes: processorNotes,
  });
};

/**
 * Notify ministry leader about a new expense submission
 */
export const notifyLeaderNewExpense = async (
  leaderEmail: string,
  leaderName: string,
  context: ExpenseNotificationContext,
  actionUrl?: string
): Promise<NotificationResult> => {
  return sendBudgetNotification({
    to: leaderEmail,
    recipientName: leaderName,
    notificationType: "expense_submitted",
    expenseTitle: context.expenseTitle,
    expenseAmount: context.expenseAmount,
    ministryName: context.ministryName,
    requesterName: context.requesterName,
    actionUrl,
  });
};

// =====================================================
// Allocation Request Notification Helpers
// =====================================================

interface AllocationNotificationContext {
  ministryName: string;
  requestedAmount: number;
  requesterName: string;
  requesterEmail: string;
}

/**
 * Notify admin about a new allocation request
 */
export const notifyAdminNewAllocationRequest = async (
  adminEmail: string,
  adminName: string,
  context: AllocationNotificationContext,
  actionUrl?: string
): Promise<NotificationResult> => {
  return sendBudgetNotification({
    to: adminEmail,
    recipientName: adminName,
    notificationType: "allocation_submitted",
    expenseAmount: context.requestedAmount,
    ministryName: context.ministryName,
    requesterName: context.requesterName,
    actionUrl,
  });
};

/**
 * Notify requester that their allocation was approved
 */
export const notifyAllocationApproved = async (
  context: AllocationNotificationContext,
  approvedAmount: number,
  reviewerNotes?: string
): Promise<NotificationResult> => {
  return sendBudgetNotification({
    to: context.requesterEmail,
    recipientName: context.requesterName,
    notificationType: "allocation_approved",
    expenseAmount: approvedAmount,
    ministryName: context.ministryName,
    requesterName: context.requesterName,
    reviewerNotes,
  });
};

/**
 * Notify requester that their allocation was denied
 */
export const notifyAllocationDenied = async (
  context: AllocationNotificationContext,
  reviewerNotes: string
): Promise<NotificationResult> => {
  return sendBudgetNotification({
    to: context.requesterEmail,
    recipientName: context.requesterName,
    notificationType: "allocation_denied",
    expenseAmount: context.requestedAmount,
    ministryName: context.ministryName,
    requesterName: context.requesterName,
    reviewerNotes,
  });
};

/**
 * Notify requester that their allocation approval was recalled
 */
export const notifyAllocationApprovalRecalled = async (
  context: AllocationNotificationContext,
  reviewerNotes: string
): Promise<NotificationResult> => {
  return sendBudgetNotification({
    to: context.requesterEmail,
    recipientName: context.requesterName,
    notificationType: "allocation_approval_recalled",
    expenseAmount: context.requestedAmount,
    ministryName: context.ministryName,
    requesterName: context.requesterName,
    reviewerNotes,
  });
};

// =====================================================
// Budget Alert Notifications
// =====================================================

/**
 * Send budget alert notification
 */
export const notifyBudgetAlert = async (
  recipientEmail: string,
  recipientName: string,
  ministryName: string,
  alertMessage: string,
  actionUrl?: string
): Promise<NotificationResult> => {
  return sendBudgetNotification({
    to: recipientEmail,
    recipientName,
    notificationType: "budget_alert",
    ministryName,
    alertMessage,
    actionUrl,
  });
};

// =====================================================
// Batch Notification Utilities
// =====================================================

interface BatchNotificationResult {
  total: number;
  successful: number;
  failed: number;
  errors: string[];
}

/**
 * Send notifications to multiple recipients
 */
export const sendBatchNotifications = async (
  payloads: NotificationPayload[]
): Promise<BatchNotificationResult> => {
  const results = await Promise.allSettled(
    payloads.map((payload) => sendBudgetNotification(payload))
  );

  const errors: string[] = [];
  let successful = 0;
  let failed = 0;

  results.forEach((result, index) => {
    if (result.status === "fulfilled" && result.value.success) {
      successful++;
    } else {
      failed++;
      const error =
        result.status === "rejected"
          ? result.reason?.message || "Unknown error"
          : result.value.error || "Unknown error";
      errors.push(`Failed to notify ${payloads[index].to}: ${error}`);
    }
  });

  return {
    total: payloads.length,
    successful,
    failed,
    errors,
  };
};
