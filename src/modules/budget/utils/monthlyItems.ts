/**
 * A monthly budget request's lines, as the form holds them and as the database
 * stores them.
 *
 * In budget_breakdown each line is
 *   { category: "monthly_budget_item", description: <the justification>,
 *     amount: <sum of the months>,
 *     monthly_data: { chart_of_accounts, description, jan..dec } }
 * and in the form each line is { justification_category, custom_justification,
 * chart_of_accounts, description, jan..dec }.
 *
 * Saving turned the second into the first, and nothing turned the first back:
 * opening an existing monthly request showed no lines, so saving it was
 * refused ("total must be greater than 0") and Edit could not be used on one.
 * Both directions live here so a test can hold them to each other.
 */

import type { BudgetBreakdownItem } from "../types";
import { PERIOD_AMOUNT_CATEGORY } from "../types";

export const MONTH_KEYS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
] as const;

export type MonthKey = (typeof MONTH_KEYS)[number];

export const MONTHLY_ITEM_CATEGORY = "monthly_budget_item";

/** One line as the form edits it. Months are optional because the form's are. */
export interface MonthlyFormItem {
  justification_category?: string;
  custom_justification?: string;
  chart_of_accounts?: string;
  description?: string;
  jan?: number; feb?: number; mar?: number; apr?: number;
  may?: number; jun?: number; jul?: number; aug?: number;
  sep?: number; oct?: number; nov?: number; dec?: number;
}

/** One line as budget_breakdown stores it. */
export interface StoredMonthlyItem {
  category: string;
  description: string;
  amount: number;
  monthly_data?: {
    chart_of_accounts?: string;
    description?: string;
  } & Partial<Record<MonthKey, number>>;
}

const monthValue = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export const monthlyItemTotal = (item: Pick<MonthlyFormItem, MonthKey>): number =>
  MONTH_KEYS.reduce((sum, month) => sum + monthValue(item[month]), 0);

/**
 * The form's lines as stored lines. The stored months are the form's values
 * as they stand, so a month left blank stays absent rather than becoming 0.
 */
export function monthlyItemsToBreakdown(
  items: MonthlyFormItem[],
  otherValue: string,
): StoredMonthlyItem[] {
  return items.map((item) => {
    const justification =
      item.justification_category === otherValue
        ? item.custom_justification
        : item.justification_category;

    return {
      category: MONTHLY_ITEM_CATEGORY,
      description: justification || "",
      amount: monthlyItemTotal(item),
      // The full line, for the detailed view.
      monthly_data: {
        chart_of_accounts: item.chart_of_accounts,
        description: item.description,
        jan: item.jan, feb: item.feb, mar: item.mar, apr: item.apr,
        may: item.may, jun: item.jun, jul: item.jul, aug: item.aug,
        sep: item.sep, oct: item.oct, nov: item.nov, dec: item.dec,
      },
    };
  });
}

/**
 * Stored lines back into the form's. A stored justification that is one of the
 * ministry's own options selects that option; anything else (typed under
 * "Other", or an option since removed from the list) comes back as Other with
 * the text kept, so nothing the ministry wrote is lost on the way through.
 */
export function monthlyItemsFromBreakdown(
  breakdown: unknown[] | null | undefined,
  justificationOptions: string[],
  otherValue: string,
): MonthlyFormItem[] {
  return (breakdown ?? [])
    .filter((raw): raw is StoredMonthlyItem =>
      !!raw && (raw as StoredMonthlyItem).category === MONTHLY_ITEM_CATEGORY,
    )
    .map((stored) => {
      const text = stored.description ?? "";
      const known = text !== "" && justificationOptions.includes(text);
      const data = stored.monthly_data ?? {};

      return {
        justification_category: known ? text : otherValue,
        custom_justification: known ? "" : text,
        chart_of_accounts: data.chart_of_accounts ?? "",
        description: data.description ?? "",
        jan: monthValue(data.jan), feb: monthValue(data.feb), mar: monthValue(data.mar),
        apr: monthValue(data.apr), may: monthValue(data.may), jun: monthValue(data.jun),
        jul: monthValue(data.jul), aug: monthValue(data.aug), sep: monthValue(data.sep),
        oct: monthValue(data.oct), nov: monthValue(data.nov), dec: monthValue(data.dec),
      };
    });
}

/**
 * What stays in the form's generic breakdown for a MONTHLY request: not the
 * monthly lines (they have their own fields and are regenerated on save, so
 * leaving them here would store every line twice) and not the period amounts.
 */
export function nonMonthlyBreakdown(
  breakdown: BudgetBreakdownItem[] | null | undefined,
): BudgetBreakdownItem[] {
  return (breakdown ?? []).filter(
    (item) =>
      item.category !== MONTHLY_ITEM_CATEGORY &&
      item.category !== PERIOD_AMOUNT_CATEGORY,
  );
}
