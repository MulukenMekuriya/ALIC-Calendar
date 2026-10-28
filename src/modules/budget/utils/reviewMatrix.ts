/**
 * The ministry-by-month table behind the review screens.
 *
 * One row per request (a ministry can have several), grouped under its
 * ministry with a subtotal. A monthly request is spread over its twelve
 * months; an annual one has no split, so its amount sits in `annual` and the
 * row is shown as "Annual only".
 *
 * `lines` keep their position in budget_breakdown: edit_request_month names
 * a line by that position, because two lines can share a justification.
 */

import { MONTH_KEYS, MONTHLY_ITEM_CATEGORY } from "./monthlyItems";
import type { AllocationRequestWithRelations } from "../types";

export interface ReviewLine {
  /** Position in the request's budget_breakdown. */
  index: number;
  justification: string;
  chartOfAccounts: string;
  months: number[];
}

export interface ReviewRow {
  request: AllocationRequestWithRelations;
  organizationId: string;
  ministryId: string;
  ministryName: string;
  isMonthly: boolean;
  lines: ReviewLine[];
  months: number[];
  annual: number;
  total: number;
}

export interface ReviewGroup {
  key: string;
  organizationId: string;
  ministryName: string;
  rows: ReviewRow[];
  months: number[];
  annual: number;
  total: number;
}

const zeros = () => new Array<number>(12).fill(0);
const num = (v: unknown) => Number(v) || 0;

export const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function buildReviewRow(request: AllocationRequestWithRelations): ReviewRow {
  const isMonthly = request.period_type === "monthly";
  const breakdown = (request.budget_breakdown ?? []) as unknown as Array<{
    category?: string;
    description?: string;
    monthly_data?: Record<string, unknown>;
  }>;
  const lines: ReviewLine[] = [];
  const months = zeros();

  if (isMonthly) {
    breakdown.forEach((item, index) => {
      if (item?.category !== MONTHLY_ITEM_CATEGORY) return;
      const data = item.monthly_data ?? {};
      const lineMonths = MONTH_KEYS.map((k) => num(data[k]));
      lineMonths.forEach((v, i) => (months[i] += v));
      lines.push({
        index,
        justification: String(item.description ?? ""),
        chartOfAccounts: String(data.chart_of_accounts ?? ""),
        months: lineMonths,
      });
    });
  }

  const annual = isMonthly ? 0 : num(request.requested_amount);
  const total = isMonthly ? months.reduce((a, b) => a + b, 0) : annual;

  return {
    request,
    organizationId: request.organization_id,
    ministryId: request.ministry_id,
    ministryName: request.ministry?.name ?? "Unknown ministry",
    isMonthly,
    lines,
    months,
    annual,
    total,
  };
}

/** Requests worth reviewing: not a draft, not cancelled. */
export const isReviewable = (status: string) => status !== "draft" && status !== "cancelled";

export function groupByMinistry(rows: ReviewRow[]): ReviewGroup[] {
  const map = new Map<string, ReviewGroup>();
  for (const row of rows) {
    const key = `${row.organizationId}:${row.ministryId}`;
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        organizationId: row.organizationId,
        ministryName: row.ministryName,
        rows: [],
        months: zeros(),
        annual: 0,
        total: 0,
      };
      map.set(key, g);
    }
    g.rows.push(row);
    row.months.forEach((v, i) => (g!.months[i] += v));
    g.annual += row.annual;
    g.total += row.total;
  }
  return [...map.values()].sort((a, b) => b.total - a.total || a.ministryName.localeCompare(b.ministryName));
}

export function totalsOf(rows: Pick<ReviewRow, "months" | "annual" | "total">[]) {
  const months = zeros();
  let annual = 0;
  let total = 0;
  for (const r of rows) {
    r.months.forEach((v, i) => (months[i] += v));
    annual += r.annual;
    total += r.total;
  }
  return { months, annual, total };
}

/** "$1,234", or "$1,234.50" when there are cents. Table cells have little room. */
export function formatReviewAmount(amount: number): string {
  const whole = Number.isInteger(amount);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
