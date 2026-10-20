/**
 * The church's email, as send-kids-notification first drew it and the budget
 * request reminder settled it: the red band with the logo and the church's
 * name, a title, "Selam {first name}," then the message, a sign-off, and a
 * footer that says replies are not read and where to go instead.
 *
 * Each email is a list of blocks, so the reminder can put its deadline after
 * the first paragraph and a finance notice can put the amount there, and both
 * still look like the same church wrote them.
 *
 * Tables for layout and inline styles throughout, because that is what
 * Outlook and Gmail both render. No Deno imports: vitest tests it, and a
 * preview renders without deploying.
 */

export const CHURCH_NAME = "Addis Lidet International Church";
/** The app serves it. addislidet.info/logo.png, the old default, is a 404. */
export const DEFAULT_LOGO_URL = "https://alic.org/alic-logo.png";
export const CHURCH_WEBSITE = "alic.org";
export const CAMPUSES = "Silver Spring, MD · Alexandria, VA";

const RED = "#b22222";
const INK = "#18181b";
const MUTED = "#71717a";

/** The colours of a fact box: red is the brand, the rest say how it went. */
const TONES = {
  red: { border: RED, background: "#fdf2f2", label: "#8b0000", note: RED },
  green: { border: "#15803d", background: "#f0fdf4", label: "#166534", note: "#15803d" },
  amber: { border: "#d97706", background: "#fffbeb", label: "#92400e", note: "#b45309" },
  gray: { border: "#a1a1aa", background: "#fafafa", label: "#52525b", note: MUTED },
} as const;

export type Tone = keyof typeof TONES;

export type Block =
  | { kind: "paragraph"; text: string }
  /** The one thing to see at a glance: a deadline, an amount. */
  | { kind: "fact"; label: string; value: string; note?: string; tone?: Tone }
  /** Somebody else's words, such as a reviewer's notes. */
  | { kind: "quote"; heading: string; text: string }
  | { kind: "button"; label: string; url: string };

export interface ChurchEmail {
  subject: string;
  /** Under the church's name in the band: "Finance · Expenses". */
  subtitle: string;
  title: string;
  /** Greeted by the first word of it; "Selam," with no name. */
  recipientName: string | null;
  blocks: Block[];
  signOff: { line: string; from: string };
  verse?: string | null;
  /** The footer's first line: replies are not read, and who to ask instead. */
  noReply: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** "$1,234.50". */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

/** Holds the last two words together, so neither sits alone on a line. */
export function keepLastWordsTogether(text: string): string {
  return text.replace(/ (\S+) (\S+)$/, " $1 $2");
}

export function greeting(name: string | null): string {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first ? `Selam ${first},` : "Selam,";
}

function renderBlock(block: Block): string {
  const para = `margin:0 0 16px;font-size:16px;line-height:1.65;color:${INK};`;
  switch (block.kind) {
    case "paragraph":
      return `<p style="${para}">${escapeHtml(block.text)}</p>`;
    case "fact": {
      const t = TONES[block.tone ?? "red"];
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;border:2px solid ${t.border};border-radius:10px;background:${t.background};">
          <tr><td style="padding:14px 18px;text-align:center;">
            <div style="font-size:12px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:${t.label};">${escapeHtml(block.label)}</div>
            <div style="font-size:26px;font-weight:800;line-height:1.3;color:${INK};">${escapeHtml(block.value)}</div>${
              block.note
                ? `
            <div style="font-size:14px;font-weight:600;color:${t.note};">${escapeHtml(block.note)}</div>`
                : ""
            }
          </td></tr>
        </table>`;
    }
    case "quote":
      return `<div style="margin:0 0 16px;padding:12px 16px;background:#fafafa;border-left:3px solid ${RED};border-radius:0 8px 8px 0;">
          <div style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${MUTED};">${escapeHtml(block.heading)}</div>
          <div style="font-size:15px;line-height:1.6;color:${INK};">${escapeHtml(block.text).replace(/\n/g, "<br>")}</div>
        </div>`;
    case "button":
      return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
          <tr><td style="border-radius:8px;background:${RED};">
            <a href="${escapeHtml(block.url)}" style="display:inline-block;padding:12px 22px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(block.label)}</a>
          </td></tr>
        </table>`;
  }
}

export function renderChurchEmail(email: ChurchEmail, logoUrl: string = DEFAULT_LOGO_URL): string {
  const para = `margin:0 0 16px;font-size:16px;line-height:1.65;color:${INK};`;
  return `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(email.subject)}</title></head>
  <body style="margin:0;padding:24px;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Noto Sans Ethiopic',sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${RED};">
        <tr>
          <td style="padding:16px 0 16px 22px;width:44px;vertical-align:middle;">
            <img src="${escapeHtml(logoUrl)}" width="44" height="44" alt="" style="display:block;border-radius:50%;background:#ffffff;">
          </td>
          <td style="padding:16px 22px 16px 14px;vertical-align:middle;color:#ffffff;">
            <div style="font-size:15px;font-weight:600;line-height:1.25;">${escapeHtml(CHURCH_NAME)}</div>
            <div style="font-size:12.5px;opacity:0.9;">${escapeHtml(email.subtitle)}</div>
          </td>
        </tr>
      </table>
      <div style="padding:22px 22px 4px;">
        <p style="margin:0 0 14px;font-size:19px;font-weight:600;line-height:1.3;color:${INK};">${escapeHtml(email.title)}</p>
        <p style="${para}">${escapeHtml(greeting(email.recipientName))}</p>
        ${email.blocks.map(renderBlock).join("\n        ")}
        <p style="${para}">${escapeHtml(email.signOff.line)}<br>${escapeHtml(email.signOff.from)}</p>${
          email.verse
            ? `
        <p style="margin:0 0 16px;padding-top:14px;border-top:1px solid #f0e4e4;font-size:13px;font-style:italic;line-height:1.5;color:${MUTED};">${escapeHtml(email.verse)}</p>`
            : ""
        }
      </div>
      <div style="padding:16px 22px 18px;background:#fafafa;border-top:1px solid #e4e4e7;font-size:12px;line-height:1.6;color:${MUTED};text-align:center;">
        <p style="margin:0 0 10px;">${escapeHtml(email.noReply)}</p>
        <p style="margin:0;"><span style="font-weight:600;color:#52525b;">${escapeHtml(CHURCH_NAME)}</span><br>
        ${CAMPUSES}<br>
        <a href="https://${CHURCH_WEBSITE}" style="color:${RED};text-decoration:none;">${CHURCH_WEBSITE}</a></p>
      </div>
    </div>
  </body>
</html>`;
}

/**
 * The same email as plain text, sent alongside: a mail client that shows no
 * HTML still gets all of it, and spam filters trust both more than HTML alone.
 */
export function renderChurchText(email: ChurchEmail): string {
  const block = (b: Block): string => {
    switch (b.kind) {
      case "paragraph":
        return b.text;
      case "fact":
        return `${b.label.toUpperCase()}:  ${b.value}${b.note ? ` (${b.note})` : ""}`;
      case "quote":
        return `${b.heading}:\n${b.text}`;
      case "button":
        return `${b.label}:\n${b.url}`;
    }
  };
  return [
    greeting(email.recipientName),
    ...email.blocks.map(block),
    `${email.signOff.line}\n${email.signOff.from}`,
    email.verse ?? null,
    `${email.noReply}\n\n${CHURCH_NAME}\n${CAMPUSES}\n${CHURCH_WEBSITE}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
