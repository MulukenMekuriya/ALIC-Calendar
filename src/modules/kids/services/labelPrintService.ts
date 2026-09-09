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
 * ON A TABLET there is no --kiosk-printing, so the OS print sheet appears and a
 * volunteer taps once to send the job. That is the QL-820NWB's own trade: it is
 * on the network and speaks AirPrint, which is why the desk chose it and the
 * DK-1202 die-cut over a USB printer and continuous roll. The layout does not
 * care — buildLabelDocument pins the page to the die-cut's 62 x 100mm, so the
 * print sheet opens on a correctly sized page rather than scaling to A4.
 *
 * The one thing to watch on iPadOS: Safari has historically printed the TOP
 * window rather than the frame for iframe.print(). If labels ever come out as a
 * screenshot of the station, that is the cause, and the fix is to print from a
 * same-origin blob in a new window on that platform only.
 */

import QRCode from "qrcode";
import { buildLabelDocument, type ChildLabelData, type ParentLabelData } from "../utils/labelTemplate";

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
      frame.style.position = "fixed";
      frame.style.right = "0";
      frame.style.bottom = "0";
      frame.style.width = "0";
      frame.style.height = "0";
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
