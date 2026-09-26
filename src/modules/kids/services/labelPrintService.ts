/**
 * Label printing.
 *
 * Impure counterpart to labelTemplate. The labels are mounted into the
 * STATION'S OWN DOCUMENT and the top window is printed, with everything else
 * hidden by a print stylesheet. See LABEL_PRINT_CSS.
 *
 * THIS USED TO BE A HIDDEN IFRAME, and the comment that sat here warned, in as
 * many words, that "Safari has historically printed the TOP window rather than
 * the frame for iframe.print(). If labels ever come out as a screenshot of the
 * station, that is the cause." On 25 September an iPad did exactly that: four
 * pages of the check-in screen went to the label printer — the "All done"
 * panel, the pickup code, a Done button — and not one label.
 *
 * There is no way to make Safari print the frame, and no browser you can
 * install on an iPad changes it: iOS requires every browser to use WebKit, so
 * Chrome and Firefox there are the same engine. Nor is there a Brother plugin
 * for iOS the way there is on Android — iOS has only AirPrint, and it is not
 * extensible. So the frame goes.
 *
 * WHY THE TOP WINDOW IS BETTER THAN THE ALTERNATIVES:
 *
 *   - It is one code path. Chrome still reads @page and lays out a 62 x 100mm
 *     page box, and --kiosk-printing still intercepts window.print() and emits
 *     silently, so the staffed desk is unchanged. A per-platform branch would
 *     be exercised only on the device nobody tests.
 *   - A blob in a new window is popup-blocked on iOS, because printLabels runs
 *     after an await and the user activation is gone by then.
 *   - A PDF costs the parent two extra taps: iOS cannot invoke AirPrint on one
 *     programmatically, so it opens in the viewer and they Share -> Print. On
 *     a self-service kiosk that is a place to get stranded.
 *
 * WHAT IS STILL NOT OURS TO FIX. Safari ignores `@page { size }` — the paper
 * is whatever the print sheet says, and no stylesheet can reach it. So THE
 * PAPER MUST BE SET TO 62 x 100mm ON EACH IPAD, once, during setup. It
 * persists per printer. On A4 or Letter, Safari keeps its own margins and
 * prints its furniture — the date, "Page 1 of 2", the station's URL — in them.
 * The body width pinned in LABEL_PRINT_CSS stops the label being scaled down
 * to fit, but it cannot choose the paper.
 *
 * If that selection ever drifts in practice, the permanent answer is not more
 * CSS: it is a small print service on the church LAN speaking raster to the
 * QL-820NWB on port 9100, which removes the browser from printing entirely.
 */

import QRCode from "qrcode";
import {
  buildLabelMarkup,
  LABEL_PRINT_CSS,
  LABEL_PRINT_ROOT_ID,
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
      // Anything left over from a print that never finished — a sheet the
      // parent dismissed, a torn-down tab. Mounting a second root would print
      // the previous family's labels alongside this one's.
      document
        .querySelectorAll(`#${LABEL_PRINT_ROOT_ID}, #${LABEL_PRINT_ROOT_ID}-css`)
        .forEach((n) => n.remove());

      const style = document.createElement("style");
      style.id = `${LABEL_PRINT_ROOT_ID}-css`;
      style.textContent = LABEL_PRINT_CSS;

      const root = document.createElement("div");
      root.id = LABEL_PRINT_ROOT_ID;
      // Hidden from assistive tech, and hidden on screen by an INLINE
      // display:none so the station never reflows around a stack of labels
      // between the tap and the sheet. LABEL_PRINT_CSS overrides it with
      // `display: block !important` inside @media print — the one thing that
      // outranks an inline style — so it is invisible right up until the
      // moment it is the only thing on the page.
      root.setAttribute("aria-hidden", "true");
      root.style.display = "none";
      root.innerHTML = buildLabelMarkup(children, parent);

      document.head.appendChild(style);
      document.body.appendChild(root);

      let settled = false;
      const cleanup = () => {
        root.remove();
        style.remove();
        window.removeEventListener("afterprint", onAfter);
      };
      const onAfter = () => cleanup();
      window.addEventListener("afterprint", onAfter);

      const finish = (result: PrintResult) => {
        if (settled) return;
        settled = true;
        // iOS has been unreliable about firing afterprint, and the kiosk
        // wipes its own state 20 seconds after a check-in — so the node has
        // to outlive the reset but not the session. 60s is long enough for a
        // parent to work the AirPrint sheet and short enough that the next
        // family never sees it.
        setTimeout(cleanup, 60000);
        resolve(result);
      };

      try {
        // No focus dance. The old iframe had to be focused for Chrome to
        // print IT rather than the station, and focus then handed back
        // because the wedge scanner is a keyboard and a scan typed into a
        // detached frame goes nowhere. Printing the top window means focus
        // never moves, so the scanner cannot lose it at all.
        window.print();
        finish({ submitted: true });
      } catch (err) {
        finish({
          submitted: false,
          error: err instanceof Error ? err.message : "Print failed",
        });
      }
      return;
    } catch (err) {
      resolve({
        submitted: false,
        error: err instanceof Error ? err.message : "Print failed",
      });
    }
  });
}

