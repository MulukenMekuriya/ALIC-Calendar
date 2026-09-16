/**
 * A member's giving, year by year, as bar widths.
 *
 * WHAT THIS DELIBERATELY DOES NOT COMPUTE
 * ---------------------------------------
 * A percentage change against last year. It is the obvious thing to put on a
 * giving tile and it would be a lie for eleven months of every twelve: the
 * current year is partial and last year is complete, so "down 34%" in August
 * means nothing except that August is not December. The church.my_giving_years
 * rows this reads are yearly totals with no months in them, so there is no
 * honest same-point-last-year figure available here either.
 *
 * What it does instead is show the years side by side at true scale and let
 * the reader draw their own conclusion, with the running year marked as
 * running. That is a smaller claim, and it is one the data supports.
 */

export interface GivingBar {
  year: number;
  totalCents: number;
  giftCount: number;
  /** 0–100, relative to the biggest year shown. */
  widthPercent: number;
  /** True for the year still being lived. Rendered differently. */
  inProgress: boolean;
}

export interface GivingYearTotal {
  tax_year: number;
  total_cents: number;
  gift_count: number;
}

/**
 * Most recent `limit` years, newest first.
 *
 * Scaled against the largest year in the window rather than against all of
 * history, so a member whose first year was exceptional does not spend every
 * later year looking at slivers.
 */
export function buildGivingBars(
  years: GivingYearTotal[],
  currentYear: number,
  limit = 5
): GivingBar[] {
  const window = [...years]
    .sort((a, b) => b.tax_year - a.tax_year)
    .slice(0, limit);

  const largest = Math.max(...window.map((y) => y.total_cents), 0);

  return window.map((y) => ({
    year: y.tax_year,
    totalCents: y.total_cents,
    giftCount: y.gift_count,
    // A year with gifts always gets a visible sliver: a bar of zero width
    // beside a printed total reads as a rendering bug, not as a small year.
    widthPercent:
      largest > 0 ? Math.max((y.total_cents / largest) * 100, y.total_cents > 0 ? 4 : 0) : 0,
    inProgress: y.tax_year === currentYear,
  }));
}

/** Last year's completed total, or null before there is a completed year. */
export function lastCompletedYear(
  years: GivingYearTotal[],
  currentYear: number
): GivingYearTotal | null {
  return (
    [...years]
      .filter((y) => y.tax_year < currentYear)
      .sort((a, b) => b.tax_year - a.tax_year)[0] ?? null
  );
}
