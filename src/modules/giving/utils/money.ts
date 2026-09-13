/**
 * Money formatting and parsing for the giving module.
 *
 * Everything in church.donations is BIGINT cents, so the boundary between
 * "what the database holds" and "what a person types" lives here and nowhere
 * else. Pure — no React, no Supabase — so it runs in the node test
 * environment.
 */

/** "$1,234.56". Cents in, display string out. */
export function formatMoney(cents: number | null | undefined): string {
  const value = (cents ?? 0) / 100;
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** "$1,235" — for tiles and axis labels where the pennies are noise. */
export function formatMoneyShort(cents: number | null | undefined): string {
  const value = Math.round((cents ?? 0) / 100);
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

/**
 * Turn whatever a human or a bank export wrote into integer cents.
 *
 * Returns null rather than 0 for anything unreadable: an import row that
 * silently becomes a zero-dollar gift is worse than one that stops and asks,
 * and the RPC rejects zero anyway.
 *
 * Handles the forms these actually arrive in:
 *   "$1,234.56"  "1234.56"  "1,234"  "  12.5  "  "(45.00)"  "-45.00"  "45.00 USD"
 *
 * Parenthesised and negative values are accounting notation for money going
 * the other way — a refund or a chargeback line in a Stripe payout. They parse
 * to a negative number so the caller can see what they are and decide; they do
 * not quietly become positive gifts.
 */
export function parseMoneyToCents(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") {
    return Number.isFinite(input) ? Math.round(input * 100) : null;
  }

  let text = input.trim();
  if (!text) return null;

  // Accounting parentheses mean negative.
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1).trim();
  }

  // Currency symbols, thousands separators, and a trailing currency code.
  text = text.replace(/\s*(usd|dollars?)\s*$/i, "");
  text = text.replace(/[$ ,\s]/g, "");

  if (text.startsWith("-")) {
    negative = true;
    text = text.slice(1);
  } else if (text.startsWith("+")) {
    text = text.slice(1);
  }

  // Anything left that is not a plain decimal is not a number we will guess at.
  if (!/^\d*\.?\d*$/.test(text) || text === "" || text === ".") return null;

  const value = Number(text);
  if (!Number.isFinite(value)) return null;

  // Round rather than truncate: 0.1 + 0.2 arithmetic upstream must not cost a
  // donor a cent on their statement.
  const cents = Math.round(value * 100);
  return negative ? -cents : cents;
}

/**
 * Normalise a date cell to an ISO date, or null.
 *
 * Deliberately narrow. Two-digit years and ambiguous d/m/y ordering are NOT
 * guessed at: a gift landing in the wrong tax year is a problem nobody
 * notices until January, so an unreadable date is reported as unreadable.
 * Accepted: 2026-01-04, 01/04/2026 and 1/4/2026 (US month-first, which is what
 * every US bank and processor exports), and 4 Jan 2026 style month names.
 */
const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

export function parseDateToIso(input: string | null | undefined): string | null {
  if (!input) return null;
  const text = input.trim();
  if (!text) return null;

  // Already ISO, possibly with a time part (Stripe exports "2026-01-04 15:04:00").
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return validDate(+iso[1], +iso[2], +iso[3]);

  // US month-first with a four-digit year.
  const us = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (us) return validDate(+us[3], +us[1], +us[2]);

  // "4 Jan 2026" / "Jan 4, 2026" / "January 4 2026"
  const named = text.match(/^(\d{1,2})\s+([A-Za-z]{3,})\.?,?\s+(\d{4})$/);
  if (named) {
    const month = MONTHS[named[2].slice(0, 3).toLowerCase()];
    if (month) return validDate(+named[3], month, +named[1]);
  }
  const named2 = text.match(/^([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (named2) {
    const month = MONTHS[named2[1].slice(0, 3).toLowerCase()];
    if (month) return validDate(+named2[3], month, +named2[2]);
  }

  return null;
}

function validDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (year < 1900 || year > 2200) return null;
  // Reject 31 February rather than letting Date roll it into March.
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Human label for church.donations.method. */
export const METHOD_LABELS: Record<string, string> = {
  card: "Card",
  ach: "Bank transfer",
  cash: "Cash",
  check: "Cheque",
  zelle: "Zelle",
  paypal: "PayPal",
  venmo: "Venmo",
  in_kind: "In kind",
  other: "Other",
};

/** Human label for church.giving_batches.source. */
export const SOURCE_LABELS: Record<string, string> = {
  stripe: "Stripe",
  paypal: "PayPal",
  zelle: "Zelle",
  venmo: "Venmo",
  cash: "Cash",
  check: "Cheques",
  ach: "Bank transfer",
  other: "Other",
};
