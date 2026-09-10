/**
 * Label printing.
 *
 * Impure counterpart to labelTemplate. Prints via a HIDDEN IFRAME rather than
 * window.open + document.write (the pattern used elsewhere in this app for
 * report printing), because for a check-in desk that pattern is wrong:
 *
 *   - a popup can be blocked, and a blocked popup means no label
 *   - it steals focus, which breaks a keyboard-wedge barcode scanner
 *   - it flashes a visible tab in front of the parent
 *
 * With the label printer as the OS default and Chrome launched with
 * --kiosk-printing, iframe.print() emits silently with no dialog.
 *
 * ON A TABLET OR PHONE there is no --kiosk-printing, so the OS print sheet
 * appears and a volunteer taps once to send the job. That is the QL-820NWB's
 * own trade: it is on the network and speaks AirPrint, which is why the desk
 * chose it and the DK-1202 die-cut over a USB printer and continuous roll.
 *
 * SAFARI DOES NOT SIZE THE PAGE THE WAY CHROME DOES, and that is what an iPhone
 * turned up: labels came out at roughly 60% adrift in the middle of a sheet,
 * with the date and the station's URL printed in the margin. Two separate
 * things cause that, and only the first is ours:
 *
 *   1. Safari ignores `@page { size }`. The paper is whatever the print sheet
 *      is set to, and the label document is laid out in a viewport and SCALED
 *      onto it — so anything wider than the label shrinks the label. The
 *      document now declares the die-cut width (see LABEL_CSS) and this frame
 *      is sized to the die-cut rather than 0 x 0, which leaves the fit-to-width
 *      pass nothing to do. Chrome is unaffected: it was already laying the page
 *      out from @page.
 *   2. The date / "Page 1 of 2" / URL furniture is the browser's, printed
 *      inside the page margin. Both engines drop it when the page margin is
 *      zero, which `@page { margin: 0 }` asks for — but on iOS the margin is
 *      the print sheet's to give, so THE PAPER MUST BE SET TO 62 x 100mm
 *      (2.4 x 3.9in) there. On A4 or Letter, Safari keeps its own margins and
 *      prints its furniture in them, and no stylesheet can reach that.
 *
 * If a desk ever needs a phone to print unattended, the way out is not more
 * CSS: emit each label as a PDF sized exactly 62 x 100mm and print that. A PDF
 * goes through AirPrint at 100% with no browser furniture at all.
 *
 * The other thing to watch on iOS: Safari has historically printed the TOP
 * window rather than the frame for iframe.print(). If labels ever come out as a
 * screenshot of the station, that is the cause, and the fix is to print from a
 * same-origin blob in a new window on that platform only.
 */

import QRCode from "qrcode";
import {
  buildLabelDocument,
  LABEL_PAGE_MM,
  type ChildLabelData,
  type ParentLabelData,
} from "../utils/labelTemplate";

/**
 * SVG QR for the pickup token.
 *
 * Returns null on failure rather than throwing: the human-readable code is
 * the real fallback, and a QR library problem must never block a check-in.
 */
export async function renderQrSvg(payload: string): Promise<string | null> {
  try {
    return await QRCode.toString(payload, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 2,
    });
  } catch {
    return null;
  }
}

export interface PrintResult {
  submitted: boolean;
  error?: string;
}

/**
 * Print the labels for one family.
 *
 * Note `submitted` means the job reached the OS spooler — NOT that paper came
 * out. The station always shows the code on screen so a volunteer can write it
 * by hand if the printer is dead.
 */
export function printLabels(
  children: ChildLabelData[],
  parent: ParentLabelData
): Promise<PrintResult> {
  return new Promise((resolve) => {
    try {
      const html = buildLabelDocument(children, parent);
      const frame = document.createElement("iframe");
      frame.setAttribute("aria-hidden", "true");
      // A REAL die-cut-sized box, parked off-screen — not the 0 x 0 frame this
      // started as. An iframe's layout viewport is its own border box, and a
      // viewport meta tag inside a frame is ignored, so the FRAME'S SIZE is the
      // only statement the label document has about how wide it is. At 0 x 0 it
      // says "no width at all" and leaves the rest to the print path: Chrome
      // re-lays the document out from @page and never noticed, Safari carried
      // the frame's geometry into AirPrint and scaled the label down to fit a
      // sheet. Off-screen rather than hidden, because display: none and
      // visibility: hidden frames have nothing to print.
      frame.style.position = "fixed";
      frame.style.left = "-9999px";
      frame.style.top = "0";
      frame.style.width = `${LABEL_PAGE_MM.width}mm`;
      frame.style.height = `${LABEL_PAGE_MM.length}mm`;
      frame.style.border = "0";
      frame.srcdoc = html;

      let settled = false;
      const finish = (result: PrintResult) => {
        if (settled) return;
        settled = true;
        // Leave the frame briefly so the print job can serialise.
        setTimeout(() => frame.remove(), 2000);
        resolve(result);
      };

      frame.onload = () => {
        // Chrome needs the frame focused to print IT rather than the page, but
        // the desk needs focus back on the lookup field: the wedge scanner is a
        // keyboard, and a scan typed into a detached iframe goes nowhere.
        const previous = document.activeElement as HTMLElement | null;
        try {
          frame.contentWindow?.focus();
          frame.contentWindow?.print();
          finish({ submitted: true });
        } catch (err) {
          finish({
            submitted: false,
            error: err instanceof Error ? err.message : "Print failed",
          });
        } finally {
          previous?.focus?.();
        }
      };

      // Watchdog: if onload never fires, do not hang the check-in flow.
      setTimeout(
        () => finish({ submitted: false, error: "Printer did not respond" }),
        5000
      );

      document.body.appendChild(frame);
    } catch (err) {
      resolve({
        submitted: false,
        error: err instanceof Error ? err.message : "Print failed",
      });
    }
  });
}
