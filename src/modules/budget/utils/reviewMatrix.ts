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
import { monthSplitOf, splitOf, type SplitState } from "./split";
import type { AllocationRequestWithRelations } from "../types";

/**
 * Green / Yellow / Red sums. `final*` count what the Board has approved;
 * `proposed*` the local leaders' marking not yet with Board approval;
 * `undecided` what nobody has marked. The Total column is Green of both
 * (the leaders asked for the Council's approval to count).
 */
export interface SplitTotals {
  finalGreen: number;
  finalYellow: number;
  finalRed: number;
  proposedGreen: number;
  proposedYellow: number;
  proposedRed: number;
  undecided: number;
}

const zeroSplit = (): SplitTotals => ({
  finalGreen: 0,
  finalYellow: 0,
  finalRed: 0,
  proposedGreen: 0,
  proposedYellow: 0,
  proposedRed: 0,
  undecided: 0,
});

function addSplit(into: SplitTotals, from: SplitTotals) {
  (Object.keys(into) as (keyof SplitTotals)[]).forEach((k) => (into[k] += from[k]));
}

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
  /** What was requested. */
  total: number;
  /** This request's split, as the colour columns show it. */
  green: number;
  yellow: number;
  red: number;
  splitState: SplitState;
  /** Green approved by the local leaders or the Board: what the Total column shows. */
  approved: number;
  /** Green / Yellow / Red per month, to tint the month columns. */
  monthSplit: { green: number; yellow: number; red: number }[];
  split: SplitTotals;
}

export interface ReviewGroup {
  key: string;
  organizationId: string;
  ministryName: string;
  rows: ReviewRow[];
  months: number[];
  annual: number;
  total: number;
  approved: number;
  split: SplitTotals;
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

  const s = splitOf(request);
  const split = zeroSplit();
  if (s.state === "final") {
    split.finalGreen = s.green;
    split.finalYellow = s.yellow;
    split.finalRed = s.red;
  } else if (s.state === "proposed") {
    split.proposedGreen = s.green;
    split.proposedYellow = s.yellow;
    split.proposedRed = s.red;
  } else {
    split.undecided = num(request.requested_amount);
  }

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
    green: s.green,
    yellow: s.yellow,
    red: s.red,
    splitState: s.state,
    approved: split.finalGreen + split.proposedGreen,
    monthSplit: monthSplitOf(request),
    split,
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
        approved: 0,
        split: zeroSplit(),
      };
      map.set(key, g);
    }
    g.rows.push(row);
    row.months.forEach((v, i) => (g!.months[i] += v));
    g.annual += row.annual;
    g.total += row.total;
    g.approved += row.approved;
    addSplit(g.split, row.split);
  }
  return [...map.values()].sort((a, b) => b.total - a.total || a.ministryName.localeCompare(b.ministryName));
}

export function totalsOf(rows: (Pick<ReviewRow, "months" | "annual" | "total"> & Partial<Pick<ReviewRow, "split">>)[]) {
  const months = zeros();
  let annual = 0;
  let total = 0;
  const split = zeroSplit();
  for (const r of rows) {
    r.months.forEach((v, i) => (months[i] += v));
    annual += r.annual;
    total += r.total;
    if (r.split) addSplit(split, r.split);
  }
  return { months, annual, total, split, approved: split.finalGreen + split.proposedGreen };
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
