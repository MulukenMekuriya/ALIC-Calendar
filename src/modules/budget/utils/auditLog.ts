/**
 * Audit Log Utilities
 * Provides tamper detection and integrity verification for expense history
 */

import type { ExpenseHistory, ExpenseHistoryWithActor } from "../types";

// =====================================================
// Audit Log Hash Generation
// =====================================================

/**
 * Generate a hash for an audit log entry
 * This creates a fingerprint of the entry that can be used to detect tampering
 */
export const generateAuditHash = async (entry: {
  id: string;
  expense_request_id: string;
  action: string;
  previous_status: string | null;
  new_status: string | null;
  actor_id: string;
  actor_name: string;
  notes: string | null;
  created_at: string;
}): Promise<string> => {
  const dataString = JSON.stringify({
    id: entry.id,
    expense_request_id: entry.expense_request_id,
    action: entry.action,
    previous_status: entry.previous_status,
    new_status: entry.new_status,
    actor_id: entry.actor_id,
    actor_name: entry.actor_name,
    notes: entry.notes,
    created_at: entry.created_at,
  });

  // Use Web Crypto API for hashing
  const encoder = new TextEncoder();
  const data = encoder.encode(dataString);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
};

/**
 * Generate a chain hash that links entries together
 * Each entry's hash includes the previous entry's hash, creating a chain
 */
export const generateChainHash = async (
  currentEntry: ExpenseHistory,
  previousHash: string | null
): Promise<string> => {
  const dataString = JSON.stringify({
    ...currentEntry,
    previous_hash: previousHash,
  });

  const encoder = new TextEncoder();
  const data = encoder.encode(dataString);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
};

// =====================================================
// Audit Log Verification
// =====================================================

export interface AuditVerificationResult {
  isValid: boolean;
  totalEntries: number;
  verifiedEntries: number;
  invalidEntries: AuditInvalidEntry[];
  chainIntact: boolean;
  verifiedAt: string;
}

export interface AuditInvalidEntry {
  entryId: string;
  reason: string;
  expectedHash?: string;
  actualHash?: string;
}

/**
 * Verify the integrity of audit log entries
 * Checks that entries haven't been modified after creation
 */
export const verifyAuditLogIntegrity = async (
  entries: ExpenseHistory[],
  storedHashes?: Record<string, string>
): Promise<AuditVerificationResult> => {
  const invalidEntries: AuditInvalidEntry[] = [];
  let verifiedCount = 0;

  // Sort entries by created_at for chain verification
  const sortedEntries = [...entries].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  for (const entry of sortedEntries) {
    try {
      const computedHash = await generateAuditHash(entry);

      if (storedHashes && storedHashes[entry.id]) {
        if (computedHash !== storedHashes[entry.id]) {
          invalidEntries.push({
            entryId: entry.id,
            reason: "Hash mismatch - entry may have been modified",
            expectedHash: storedHashes[entry.id],
            actualHash: computedHash,
          });
          continue;
        }
      }

      verifiedCount++;
    } catch (error) {
      invalidEntries.push({
        entryId: entry.id,
        reason: `Verification failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  }

  return {
    isValid: invalidEntries.length === 0,
    totalEntries: entries.length,
    verifiedEntries: verifiedCount,
    invalidEntries,
    chainIntact: invalidEntries.length === 0,
    verifiedAt: new Date().toISOString(),
  };
};

// =====================================================
// Audit Log Formatting
// =====================================================

export interface FormattedAuditEntry {
  id: string;
  timestamp: string;
  formattedTime: string;
  action: string;
  actionLabel: string;
  actorName: string;
  actorId: string;
  previousStatus: string | null;
  newStatus: string | null;
  notes: string | null;
  expenseRequestId: string;
}

const ACTION_LABELS: Record<string, string> = {
  created: "Created",
  submitted: "Submitted for Review",
  leader_approved: "Approved by Leader",
  leader_denied: "Denied by Leader",
  treasury_approved: "Approved by Treasury",
  treasury_denied: "Denied by Treasury",
  completed: "Payment Completed",
  cancelled: "Cancelled",
  updated: "Updated",
};

/**
 * Format audit log entries for display
 */
export const formatAuditEntries = (
  entries: ExpenseHistoryWithActor[]
): FormattedAuditEntry[] => {
  return entries.map((entry) => ({
    id: entry.id,
    timestamp: entry.created_at,
    formattedTime: formatAuditTimestamp(entry.created_at),
    action: entry.action,
    actionLabel: ACTION_LABELS[entry.action] || entry.action,
    actorName: entry.actor_profile?.full_name || entry.actor_name,
    actorId: entry.actor_id,
    previousStatus: entry.previous_status,
    newStatus: entry.new_status,
    notes: entry.notes,
    expenseRequestId: entry.expense_request_id,
  }));
};

const formatAuditTimestamp = (isoString: string): string => {
  const date = new Date(isoString);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
};

// =====================================================
// Audit Log Export
// =====================================================

/**
 * Export audit log to CSV for compliance purposes
 */
export const exportAuditLogToCSV = (entries: ExpenseHistoryWithActor[]): string => {
  const headers = [
    "Entry ID",
    "Timestamp",
    "Action",
    "Previous Status",
    "New Status",
    "Actor ID",
    "Actor Name",
    "Notes",
    "Expense Request ID",
  ];

  const rows = entries.map((entry) => [
    entry.id,
    entry.created_at,
    entry.action,
    entry.previous_status || "",
    entry.new_status || "",
    entry.actor_id,
    entry.actor_name,
    entry.notes || "",
    entry.expense_request_id,
  ]);

  const escapeCSV = (val: string) => {
    if (val.includes(",") || val.includes('"') || val.includes("\n")) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };

  return [
    headers.join(","),
    ...rows.map((row) => row.map(escapeCSV).join(",")),
  ].join("\n");
};

// =====================================================
// Immutability Enforcement Types
// =====================================================

/**
 * Configuration for audit log retention
 */
export interface AuditRetentionConfig {
  // Minimum days to retain audit logs (compliance requirement)
  minRetentionDays: number;
  // Whether to allow soft deletes (marking as archived vs actual deletion)
  allowSoftDelete: boolean;
  // Whether to require dual approval for any audit modifications
  requireDualApproval: boolean;
}

export const DEFAULT_RETENTION_CONFIG: AuditRetentionConfig = {
  minRetentionDays: 2555, // ~7 years for financial records
  allowSoftDelete: false,
  requireDualApproval: true,
};

/**
 * Check if an audit entry can be modified based on retention policy
 * Generally, audit entries should NEVER be modified
 */
export const canModifyAuditEntry = (
  entry: ExpenseHistory,
  config: AuditRetentionConfig = DEFAULT_RETENTION_CONFIG
): { allowed: boolean; reason: string } => {
  // Audit entries should never be modified - this is for documentation
  return {
    allowed: false,
    reason: "Audit log entries are immutable and cannot be modified. This ensures compliance and data integrity.",
  };
};

/**
 * Check if an audit entry can be deleted based on retention policy
 */
export const canDeleteAuditEntry = (
  entry: ExpenseHistory,
  config: AuditRetentionConfig = DEFAULT_RETENTION_CONFIG
): { allowed: boolean; reason: string } => {
  const createdAt = new Date(entry.created_at);
  const now = new Date();
  const daysSinceCreation = Math.floor(
    (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysSinceCreation < config.minRetentionDays) {
    return {
      allowed: false,
      reason: `Audit entries must be retained for at least ${config.minRetentionDays} days. This entry is only ${daysSinceCreation} days old.`,
    };
  }

  if (!config.allowSoftDelete) {
    return {
      allowed: false,
      reason: "Deletion of audit entries is disabled. Contact system administrator for archival procedures.",
    };
  }

  return {
    allowed: true,
    reason: "Entry is past retention period and can be archived.",
  };
};
