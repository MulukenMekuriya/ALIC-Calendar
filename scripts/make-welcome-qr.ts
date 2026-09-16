/**
 * The QR code the media team puts on the screen.
 *
 *     npx tsx scripts/make-welcome-qr.ts
 *     npx tsx scripts/make-welcome-qr.ts --base https://www.addislidet.info
 *
 * Writes, into qr-codes/ at the repo root:
 *
 *     welcome-md.png   2000px, for the projector and for print
 *     welcome-md.svg   vector, for anyone laying it out properly
 *     welcome-va.png   the same for Springfield
 *     welcome-va.svg
 *     welcome-slide.html  a ready-made full-screen slide, open and present it
 *
 * WHY TWO CODES. /welcome?b=md and /welcome?b=va. The branch cannot be guessed
 * from the phone doing the scanning, and registering somebody into the wrong
 * campus is a row the office has to move by hand. One code per building.
 *
 * ERROR CORRECTION IS SET TO 'H', the highest level, which lets a scan succeed
 * with up to 30% of the code obscured. On a projector that matters: somebody
 * walks in front of it, the screen has a logo bug in the corner, the camera is
 * at an angle from row fifteen.
 *
 * THE QUIET ZONE (margin) is 2 modules rather than the default 4. A projected
 * code is already surrounded by slide, and the extra white band just makes the
 * pattern smaller on screen.
 */

import QRCode from "qrcode";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const baseFlag = args.indexOf("--base");
const BASE =
  baseFlag >= 0 && args[baseFlag + 1]
    ? args[baseFlag + 1].replace(/\/+$/, "")
    : "https://alic.org";

const BRANCHES = [
  { code: "md", name: "ALIC MD — Silver Spring" },
  { code: "va", name: "ALIC VA — Springfield" },
];

const OUT = join(process.cwd(), "qr-codes");

const options = {
  errorCorrectionLevel: "H" as const,
  margin: 2,
  color: { dark: "#111111", light: "#FFFFFF" },
};

async function main() {
  mkdirSync(OUT, { recursive: true });

  const made: { code: string; name: string; url: string }[] = [];

  for (const branch of BRANCHES) {
    const url = `${BASE}/welcome?b=${branch.code}`;

    await QRCode.toFile(join(OUT, `welcome-${branch.code}.png`), url, {
      ...options,
      type: "png",
      width: 2000,
    });

    const svg = await QRCode.toString(url, { ...options, type: "svg" });
    writeFileSync(join(OUT, `welcome-${branch.code}.svg`), svg);

    made.push({ ...branch, url });
    console.log(`  ${branch.name}`);
    console.log(`     ${url}`);
    console.log(`     qr-codes/welcome-${branch.code}.png  (2000px)`);
    console.log(`     qr-codes/welcome-${branch.code}.svg`);
  }

  // A slide the media team can open and present as-is, with the code big and
  // the URL readable underneath for anyone whose camera will not focus.
  const slides = await Promise.all(
    made.map(async (b) => {
      const dataUrl = await QRCode.toDataURL(b.url, { ...options, width: 900 });
      return `
  <section>
    <h1>Set up your church account</h1>
    <p class="sub">Scan with your phone camera</p>
    <img src="${dataUrl}" alt="QR code to ${b.url}" />
    <p class="url">${b.url.replace(/^https:\/\//, "")}</p>
    <p class="branch">${b.name}</p>
  </section>`;
    })
  );

  writeFileSync(
    join(OUT, "welcome-slide.html"),
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Welcome QR — ALIC</title>
<style>
  html, body { margin: 0; background: #0b1020; color: #fff;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; }
  section { min-height: 100vh; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 12px;
    page-break-after: always; padding: 4vh 4vw; box-sizing: border-box; }
  h1 { margin: 0; font-size: clamp(28px, 5vw, 64px); text-align: center; }
  .sub { margin: 0 0 8px; font-size: clamp(16px, 2.2vw, 28px); opacity: .75; }
  img { width: min(56vh, 70vw); height: auto; background: #fff;
    padding: 2.2vh; border-radius: 18px; }
  .url { margin: 6px 0 0; font-size: clamp(16px, 2.4vw, 30px);
    letter-spacing: .02em; opacity: .9; }
  .branch { margin: 0; font-size: clamp(13px, 1.6vw, 20px); opacity: .55; }
  @media print { html, body { background: #fff; color: #000; } img { padding: 6mm; } }
</style>
</head>
<body>${slides.join("\n")}
</body>
</html>`
  );

  console.log(`\n  qr-codes/welcome-slide.html  — open and present full screen`);
  console.log(`\nPoints at ${BASE}. Pass --base <url> if that is not where the app lives.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
