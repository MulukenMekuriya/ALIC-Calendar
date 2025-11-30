/**
 * Budget Module Types
 * Enterprise-grade type definitions for budget management
 * Uses the 'budget' schema for all budget-related tables
 */

import type { Tables, TablesInsert, TablesUpdate, Enums } from "@/integrations/supabase/types";

// Base database types from budget schema
export type Ministry = Tables<{ schema: "budget" }, "ministries">;
export type MinistryInsert = TablesInsert<{ schema: "budget" }, "ministries">;
export type MinistryUpdate = TablesUpdate<{ schema: "budget" }, "ministries">;

export type FiscalYear = Tables<{ schema: "budget" }, "fiscal_years">;
export type FiscalYearInsert = TablesInsert<{ schema: "budget" }, "fiscal_years">;
export type FiscalYearUpdate = TablesUpdate<{ schema: "budget" }, "fiscal_years">;

export type BudgetAllocation = Tables<{ schema: "budget" }, "budget_allocations">;
export type BudgetAllocationInsert = TablesInsert<{ schema: "budget" }, "budget_allocations">;
export type BudgetAllocationUpdate = TablesUpdate<{ schema: "budget" }, "budget_allocations">;

export type ExpenseRequest = Tables<{ schema: "budget" }, "expense_requests">;
export type ExpenseRequestInsert = TablesInsert<{ schema: "budget" }, "expense_requests">;
export type ExpenseRequestUpdate = TablesUpdate<{ schema: "budget" }, "expense_requests">;

export type ExpenseHistory = Tables<{ schema: "budget" }, "expense_history">;
export type ExpenseHistoryInsert = TablesInsert<{ schema: "budget" }, "expense_history">;

// Enum types from budget schema
export type ExpenseStatus = Enums<{ schema: "budget" }, "expense_status">;
export type ReimbursementType = Enums<{ schema: "budget" }, "reimbursement_type">;

// Extended types with relationships
export interface MinistryWithLeader extends Ministry {
  leader?: {
    id: string;
    full_name: string;
    email: string;
  } | null;
}

export interface BudgetAllocationWithRelations extends BudgetAllocation {
  ministry: Ministry;
  fiscal_year: FiscalYear;
  approved_by_profile?: {
    id: string;
    full_name: string;
  } | null;
}

export interface ExpenseRequestWithRelations extends ExpenseRequest {
  ministry: Ministry;
  fiscal_year: FiscalYear;
  requester_profile?: {
    id: string;
    full_name: string;
    email: string;
    phone_number: string | null;
  } | null;
  leader_reviewer_profile?: {
    id: string;
    full_name: string;
  } | null;
  treasury_reviewer_profile?: {
    id: string;
    full_name: string;
  } | null;
  finance_processor_profile?: {
    id: string;
    full_name: string;
  } | null;
}

export interface ExpenseHistoryWithActor extends ExpenseHistory {
  actor_profile?: {
    id: string;
    full_name: string;
  } | null;
}

// Budget summary types
export interface MinistryBudgetSummary {
  ministry_id: string;
  ministry_name: string;
  fiscal_year_id: string;
  fiscal_year_name: string;
  allocated_amount: number;
  total_pending: number;
  total_approved: number;
  total_spent: number;
  remaining: number;
}

export interface OrganizationBudgetSummary {
  fiscal_year_id: string;
  fiscal_year_name: string;
  total_allocated: number;
  total_pending: number;
  total_approved: number;
  total_spent: number;
  total_remaining: number;
  ministry_summaries: MinistryBudgetSummary[];
}

// Workflow types
export type ExpenseWorkflowStep =
  | "draft"
  | "pending_leader"
  | "leader_review"
  | "pending_treasury"
  | "treasury_review"
  | "pending_finance"
  | "finance_processing"
  | "completed";

export interface WorkflowAction {
  action: "submit" | "approve" | "deny" | "process" | "cancel";
  notes?: string;
  payment_reference?: string;
}

// Form types
export interface ExpenseRequestFormData {
  ministry_id: string;
  title: string;
  description?: string;
  amount: number;
  reimbursement_type: ReimbursementType;
  requester_name: string;
  requester_phone?: string;
  requester_email?: string;
  attachments?: AttachmentData[];
}

export interface AttachmentData {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
  uploaded_at: string;
}

// Filter types
export interface ExpenseFilters {
  status?: ExpenseStatus | ExpenseStatus[];
  ministry_id?: string;
  fiscal_year_id?: string;
  requester_id?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
}

export interface BudgetFilters {
  fiscal_year_id?: string;
  ministry_id?: string;
}

// Role-based view types
export type BudgetUserRole =
  | "requester"       // Can submit expense requests
  | "ministry_leader" // Can approve/deny ministry expenses
  | "treasury"        // Can approve/deny payments
  | "finance"         // Can process payments
  | "admin";          // Full access

export interface BudgetPermissions {
  canSubmitExpenses: boolean;
  canViewAllExpenses: boolean;
  canApproveAsLeader: boolean;
  canApproveAsTreasury: boolean;
  canProcessAsFinance: boolean;
  canManageBudgets: boolean;
  canManageMinistries: boolean;
  canManageFiscalYears: boolean;
}

// Status configuration
export interface StatusConfig {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: string;
  description: string;
}

export const EXPENSE_STATUS_CONFIG: Record<ExpenseStatus, StatusConfig> = {
  draft: {
    label: "Draft",
    color: "text-gray-600",
    bgColor: "bg-gray-100",
    borderColor: "border-gray-200",
    icon: "FileEdit",
    description: "Not yet submitted",
  },
  pending_leader: {
    label: "Pending Leader Review",
    color: "text-yellow-600",
    bgColor: "bg-yellow-50",
    borderColor: "border-yellow-200",
    icon: "Clock",
    description: "Awaiting ministry leader approval",
  },
  leader_approved: {
    label: "Leader Approved",
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    icon: "CheckCircle",
    description: "Approved by leader, awaiting treasury",
  },
  leader_denied: {
    label: "Denied by Leader",
    color: "text-red-600",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
    icon: "XCircle",
    description: "Request was denied by ministry leader",
  },
  pending_treasury: {
    label: "Pending Treasury",
    color: "text-orange-600",
    bgColor: "bg-orange-50",
    borderColor: "border-orange-200",
    icon: "Clock",
    description: "Awaiting treasury unit review",
  },
  treasury_approved: {
    label: "Payment Approved",
    color: "text-indigo-600",
    bgColor: "bg-indigo-50",
    borderColor: "border-indigo-200",
    icon: "CheckCircle",
    description: "Payment approved, awaiting finance processing",
  },
  treasury_denied: {
    label: "Payment Denied",
    color: "text-red-600",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
    icon: "XCircle",
    description: "Payment was denied by treasury",
  },
  pending_finance: {
    label: "Processing Payment",
    color: "text-purple-600",
    bgColor: "bg-purple-50",
    borderColor: "border-purple-200",
    icon: "Loader",
    description: "Finance is processing the payment",
  },
  completed: {
    label: "Completed",
    color: "text-green-600",
    bgColor: "bg-green-50",
    borderColor: "border-green-200",
    icon: "CheckCircle2",
    description: "Payment completed successfully",
  },
  cancelled: {
    label: "Cancelled",
    color: "text-gray-500",
    bgColor: "bg-gray-50",
    borderColor: "border-gray-200",
    icon: "Ban",
    description: "Request was cancelled",
  },
};

export const REIMBURSEMENT_TYPE_LABELS: Record<ReimbursementType, string> = {
  cash: "Cash",
  check: "Check",
  bank_transfer: "Bank Transfer",
  zelle: "Zelle",
  other: "Other",
};

// =====================================================
// Allocation Request Types
// =====================================================

export type AllocationPeriodType = "annual" | "quarterly" | "monthly";

export type AllocationRequestStatus =
  | "draft"
  | "pending"
  | "approved"
  | "partially_approved"
  | "denied"
  | "cancelled";

export interface AllocationRequest {
  id: string;
  organization_id: string;
  fiscal_year_id: string;
  ministry_id: string;
  requester_id: string;
  requester_name: string;
  period_type: AllocationPeriodType;
  period_number: number | null;
  requested_amount: number;
  justification: string;
  budget_breakdown: BudgetBreakdownItem[] | null;
  status: AllocationRequestStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  admin_notes: string | null;
  approved_amount: number | null;
  created_at: string;
  updated_at: string;
}

export interface AllocationRequestInsert {
  organization_id: string;
  fiscal_year_id: string;
  ministry_id: string;
  requester_id: string;
  requester_name: string;
  period_type: AllocationPeriodType;
  period_number?: number | null;
  requested_amount: number;
  justification: string;
  budget_breakdown?: BudgetBreakdownItem[] | null;
  status?: AllocationRequestStatus;
}

export interface AllocationRequestUpdate {
  period_type?: AllocationPeriodType;
  period_number?: number | null;
  requested_amount?: number;
  justification?: string;
  budget_breakdown?: BudgetBreakdownItem[] | null;
  status?: AllocationRequestStatus;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  admin_notes?: string | null;
  approved_amount?: number | null;
}

export interface BudgetBreakdownItem {
  category: string;
  description: string;
  amount: number;
}

// Internal category marker for period amounts in budget breakdown
export const PERIOD_AMOUNT_CATEGORY = "__period_amount__" as const;

export interface AllocationRequestWithRelations extends AllocationRequest {
  ministry: Ministry;
  fiscal_year: FiscalYear;
  requester_profile?: {
    id: string;
    full_name: string;
    email: string;
  } | null;
  reviewer_profile?: {
    id: string;
    full_name: string;
  } | null;
}

export interface AllocationRequestHistory {
  id: string;
  request_id: string;
  action: string;
  actor_id: string;
  actor_name: string;
  old_status: AllocationRequestStatus | null;
  new_status: AllocationRequestStatus | null;
  notes: string | null;
  created_at: string;
}

// Period helpers
export const PERIOD_TYPE_LABELS: Record<AllocationPeriodType, string> = {
  annual: "Annual",
  quarterly: "Quarterly",
  monthly: "Monthly",
};

export const QUARTERLY_PERIODS = [
  { value: 1, label: "Q1 (Jan - Mar)" },
  { value: 2, label: "Q2 (Apr - Jun)" },
  { value: 3, label: "Q3 (Jul - Sep)" },
  { value: 4, label: "Q4 (Oct - Dec)" },
];

export const MONTHLY_PERIODS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

export const getPeriodLabel = (
  periodType: AllocationPeriodType,
  periodNumber: number | null
): string => {
  if (periodType === "annual") return "Annual";
  if (periodType === "quarterly" && periodNumber) {
    return QUARTERLY_PERIODS.find((p) => p.value === periodNumber)?.label || `Q${periodNumber}`;
  }
  if (periodType === "monthly" && periodNumber) {
    return MONTHLY_PERIODS.find((p) => p.value === periodNumber)?.label || `Month ${periodNumber}`;
  }
  return "Unknown";
};

// Allocation Request Status Config
export const ALLOCATION_REQUEST_STATUS_CONFIG: Record<AllocationRequestStatus, StatusConfig> = {
  draft: {
    label: "Draft",
    color: "text-gray-600",
    bgColor: "bg-gray-100",
    borderColor: "border-gray-200",
    icon: "FileEdit",
    description: "Not yet submitted",
  },
  pending: {
    label: "Pending Review",
    color: "text-yellow-600",
    bgColor: "bg-yellow-50",
    borderColor: "border-yellow-200",
    icon: "Clock",
    description: "Awaiting admin review",
  },
  approved: {
    label: "Approved",
    color: "text-green-600",
    bgColor: "bg-green-50",
    borderColor: "border-green-200",
    icon: "CheckCircle",
    description: "Request approved in full",
  },
  partially_approved: {
    label: "Partially Approved",
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    icon: "CheckCircle",
    description: "Approved for a different amount",
  },
  denied: {
    label: "Denied",
    color: "text-red-600",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
    icon: "XCircle",
    description: "Request was denied",
  },
  cancelled: {
    label: "Cancelled",
    color: "text-gray-500",
    bgColor: "bg-gray-50",
    borderColor: "border-gray-200",
    icon: "Ban",
    description: "Request was cancelled",
  },
};
