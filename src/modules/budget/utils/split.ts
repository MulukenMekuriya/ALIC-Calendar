/**
 * Green / Yellow / Red: how a budget request's money was decided.
 *
 *   Green   approved; the ministry's budget is credited with it.
 *   Yellow  justified, but waiting on giving and available funds.
 *   Red     denied: whatever is neither Green nor Yellow.
 *
 * The Leadership Council proposes a split when it conditionally approves; the
 * Board confirms or changes it. Yellow money is later moved to Green or Red
 * (budget.release_yellow). See migration 20260322441700.
 *
 * There is no status for "waiting on giving": it is yellow_amount > 0 on a
 * decided (approved / partially_approved) request.
 */

import type { AllocationRequest, SplitCellRecord } from "../types";
import { MONTH_KEYS, MONTHLY_ITEM_CATEGORY, type MonthKey } from "./monthlyItems";

export type SplitState = "none" | "proposed" | "final";

export interface Split {
  requested: number;
  green: number;
  yellow: number;
  red: number;
  /** none: nobody has split it yet. proposed: the Council's, not yet the Board's. final: decided. */
  state: SplitState;
}

type SplitSubject = Pick<AllocationRequest, "status" | "requested_amount" | "approved_amount"> &
  Partial<Pick<AllocationRequest, "green_amount" | "yellow_amount">>;

const num = (v: unknown) => Number(v) || 0;
const round2 = (n: number) => Math.round(n * 100) / 100;

const DECIDED = ["approved", "partially_approved", "denied"];

export function splitOf(request: SplitSubject): Split {
  const requested = num(request.requested_amount);
  const status = request.status;

  if (status === "denied") {
    return { requested, green: 0, yellow: 0, red: requested, state: "final" };
  }

  const hasSplit = request.green_amount != null || request.yellow_amount != null;

  if (DECIDED.includes(status)) {
    // Rows decided before the split existed carry only approved_amount.
    const green = hasSplit ? num(request.green_amount) : num(request.approved_amount ?? requested);
    const yellow = hasSplit ? num(request.yellow_amount) : 0;
    return { requested, green, yellow, red: round2(Math.max(0, requested - green - yellow)), state: "final" };
  }

  if (hasSplit && (status === "conditionally_approved" || status === "board_review" || status === "under_review")) {
    const green = num(request.green_amount);
    const yellow = num(request.yellow_amount);
    return { requested, green, yellow, red: round2(Math.max(0, requested - green - yellow)), state: "proposed" };
  }

  return { requested, green: 0, yellow: 0, red: 0, state: "none" };
}

/** Decided, with Yellow money still waiting on giving. */
export const hasYellowWaiting = (request: SplitSubject) => {
  const s = splitOf(request);
  return s.state === "final" && s.yellow > 0;
};

/** The confirmed Green amount: what the ministry actually has to spend. */
export const confirmedGreen = (request: SplitSubject) => {
  const s = splitOf(request);
  return s.state === "final" ? s.green : 0;
};

/**
 * Green approved by the local leaders or the Board: the Total column. The
 * leaders asked for the Council's approval to count before the Board's.
 */
export const approvedGreen = (request: SplitSubject) => {
  const s = splitOf(request);
  return s.state === "none" ? 0 : s.green;
};

/** One line-and-month of a request, with its marking. */
export interface SplitCell {
  index: number;
  month: MonthKey;
  monthIndex: number;
  line: string;
  amount: number;
  green: number;
  yellow: number;
  red: number;
}

type CellSubject = SplitSubject &
  Partial<Pick<AllocationRequest, "budget_breakdown" | "split_cells" | "period_type">>;

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Every line-and-month with money in it, with its marking. A cell with no
 * stored marking is Green when the whole request is Green (or `unmarked` says
 * so), otherwise unknown: all three 0.
 */
export function cellsOf(request: CellSubject, unmarked: "green" | "auto" = "auto"): SplitCell[] {
  const breakdown = (request.budget_breakdown ?? []) as unknown as Array<{
    category?: string;
    description?: string;
    monthly_data?: Record<string, unknown>;
  }>;
  const stored = (request.split_cells ?? null) as SplitCellRecord[] | null;
  const s = splitOf(request);
  const allGreen = unmarked === "green" || (s.state !== "none" && s.green >= s.requested && s.requested > 0);
  const cells: SplitCell[] = [];

  breakdown.forEach((item, index) => {
    if (item?.category !== MONTHLY_ITEM_CATEGORY) return;
    MONTH_KEYS.forEach((month, monthIndex) => {
      const amount = round(num(item.monthly_data?.[month]));
      if (amount <= 0) return;
      const mark = stored?.find((c) => c.index === index && c.month === month);
      const green = mark ? num(mark.green) : allGreen ? amount : 0;
      const yellow = mark ? num(mark.yellow) : 0;
      const red = mark || allGreen ? round(Math.max(0, amount - green - yellow)) : 0;
      cells.push({ index, month, monthIndex, line: String(item.description ?? ""), amount, green, yellow, red });
    });
  });
  return cells;
}

/** Green / Yellow / Red per month (12 entries), for tinting the month columns. */
export function monthSplitOf(request: CellSubject): { green: number; yellow: number; red: number }[] {
  const out = MONTH_KEYS.map(() => ({ green: 0, yellow: 0, red: 0 }));
  if (splitOf(request).state === "none") return out;
  for (const c of cellsOf(request)) {
    out[c.monthIndex].green += c.green;
    out[c.monthIndex].yellow += c.yellow;
    out[c.monthIndex].red += c.red;
  }
  return out;
}

/** Does this request have months to mark, or is it marked in dollars? */
export const hasCells = (request: CellSubject) => cellsOf(request, "green").length > 0;

/** A short name for where the money stands, for badges and emails. */
export function splitHeadline(request: SplitSubject): string | null {
  const s = splitOf(request);
  if (s.state !== "final") return null;
  if (s.green >= s.requested && s.requested > 0) return "Approved (Green)";
  if (s.green === 0 && s.yellow === 0) return "Denied (Red)";
  if (s.green === 0 && s.red === 0) return "Justified – pending funds (Yellow)";
  if (s.yellow > 0) return "Partly approved – some pending funds";
  return "Partly approved";
}

export const SPLIT_COLORS = {
  green: {
    text: "text-emerald-700 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    border: "border-emerald-300 dark:border-emerald-800",
    dot: "bg-emerald-500",
  },
  yellow: {
    text: "text-amber-700 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-950/40",
    border: "border-amber-300 dark:border-amber-800",
    dot: "bg-amber-400",
  },
  red: {
    text: "text-red-700 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-950/40",
    border: "border-red-300 dark:border-red-800",
    dot: "bg-red-500",
  },
} as const;

export type SplitColor = keyof typeof SPLIT_COLORS;

export const SPLIT_LABELS: Record<SplitColor, string> = {
  green: "Green – Approved",
  yellow: "Yellow – Pending funds",
  red: "Red – Denied",
};

/**
 * Parse what the split dialog's two inputs say. Red is the rest. Returns an
 * error in words, or the amounts.
 */
export function parseSplit(
  requested: number,
  greenText: string,
  yellowText: string,
): { green: number; yellow: number; red: number; error: string | null } {
  const g = greenText.trim() === "" ? 0 : Number(greenText);
  const y = yellowText.trim() === "" ? 0 : Number(yellowText);
  if (!Number.isFinite(g) || !Number.isFinite(y)) return { green: 0, yellow: 0, red: 0, error: "Enter amounts in dollars." };
  if (g < 0 || y < 0) return { green: g, yellow: y, red: 0, error: "Amounts cannot be less than $0." };
  const green = round2(g);
  const yellow = round2(y);
  const red = round2(requested - green - yellow);
  if (red < 0) return { green, yellow, red: 0, error: "Green and Yellow together are more than was requested." };
  if (green + yellow === 0) return { green, yellow, red, error: "Nothing is Green or Yellow. To refuse the whole request, deny it." };
  return { green, yellow, red, error: null };
}
