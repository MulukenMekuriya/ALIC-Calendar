/**
 * Noticing that the tab has been open since a previous release.
 *
 * WHY THIS EXISTS. On 26 September an iPad printed four pages of the check-in
 * screen to the label printer. The bug it was hitting had been fixed and
 * deployed that morning; the iPad was running the build from before it,
 * because the check-in page had been open in Safari since the week before and
 * a single-page app never reloads itself. Nothing on the device said so, and
 * nothing in the app could be asked.
 *
 * Printing is the least of it. A station left open across a release is also
 * running the previous consent rules, the previous pick-up checks and the
 * previous medical display, and on a Sunday morning nobody is going to notice.
 *
 * HOW A NEW BUILD IS RECOGNISED. Vite gives the entry bundle a content hash —
 * /assets/index-DEbcyN7i.js — so the file named by a freshly fetched index.html
 * is a different file whenever the code is different. No version endpoint to
 * maintain, no build-time wiring, and it asks exactly the question that
 * matters: "would reloading get me different code?"
 */

/** Marks the app as mid-something. A busy screen is never reloaded. */
export const BUSY_ATTRIBUTE = "data-app-busy";

/**
 * The module bundle an HTML document loads.
 *
 * Deliberately a regex over the markup rather than DOMParser: this runs
 * against text fetched from the network, and handing that to a parser to build
 * a live document tree is more machinery — and more attack surface — than
 * reading one attribute needs.
 */
export const entryScriptFrom = (html: string): string | null => {
  const match =
    html.match(/<script[^>]*\stype=["']module["'][^>]*\ssrc=["']([^"']+)["']/i) ??
    html.match(/<script[^>]*\ssrc=["']([^"']+)["'][^>]*\stype=["']module["']/i);

  return match ? match[1] : null;
};

/** What the running document itself loaded, for comparison. */
export const currentEntryScript = (doc: Document = document): string | null => {
  const script = doc.querySelector<HTMLScriptElement>(
    'script[type="module"][src]',
  );

  if (!script) return null;

  // getAttribute, not .src: the property is resolved to an absolute URL and
  // the fetched markup gives a relative one, so the two would never match.
  return script.getAttribute("src");
};

export type UpdateMode =
  /** Unattended screens: reload without asking, when nothing is in progress. */
  | "auto"
  /** Staffed screens: offer it, because somebody may be half way through a form. */
  | "prompt";

export type UpdateDecision = "reload" | "offer" | "wait";

export interface ReloadConditions {
  /** A different entry bundle is being served than the one we are running. */
  hasNewBuild: boolean;
  mode: UpdateMode;
  /** The app has said it is mid-something — a check-in, a print, a form. */
  busy: boolean;
  /** Milliseconds since the last key, tap or pointer event. */
  idleForMs: number;
  /** Whether anyone is looking at this tab right now. */
  visible: boolean;
  /**
   * This tab has already reloaded itself once for a new build.
   *
   * The failure this bounds: if the served entry bundle differs for any reason
   * a reload does not resolve — a proxy rewriting the markup, a CDN serving
   * two versions, a caching layer that never gives this device the new file —
   * then "reload on mismatch" is an infinite loop on an unattended screen in a
   * church lobby. One reload is worth having. A second one is a symptom, and
   * the right response to a symptom is to stop and say so.
   */
  alreadyReloaded: boolean;
}

/**
 * How long a screen has to be untouched before it is safe to reload under it.
 *
 * A check-in takes seconds and the kiosk wipes itself after its own timeout,
 * so two minutes of nothing means nobody is standing there.
 */
export const IDLE_BEFORE_RELOAD_MS = 120_000;

/**
 * Whether to reload now, offer it, or leave it alone.
 *
 * The whole policy, in one pure function, because "was it safe to reload at
 * that moment" is the question that will be asked after it reloads under
 * somebody — and a question you cannot ask in a test is one you answer by
 * arguing.
 */
export const decideReload = ({
  hasNewBuild,
  mode,
  busy,
  idleForMs,
  visible,
  alreadyReloaded,
}: ReloadConditions): UpdateDecision => {
  if (!hasNewBuild) return "wait";

  // Mid-check-in is never the moment, whatever else is true.
  if (busy) return "wait";

  // Reloading did not take the first time. Ask a person rather than doing it
  // again, and again, and again.
  if (alreadyReloaded) return "offer";

  // Nobody is looking: the cheapest possible moment to take the new code,
  // and the one where a reload costs nothing at all.
  if (!visible) return "reload";

  if (mode === "prompt") return "offer";

  return idleForMs >= IDLE_BEFORE_RELOAD_MS ? "reload" : "wait";
};

/**
 * Screens that run unattended, where a reload is nobody's interruption.
 *
 * Everything else is somebody's desk, and gets asked rather than reloaded:
 * they may be half way through typing a budget request.
 */
const UNATTENDED_ROUTES = ["/kiosk", "/checkin", "/checkout", "/welcome"];

export const updateModeForPath = (pathname: string): UpdateMode =>
  UNATTENDED_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  )
    ? "auto"
    : "prompt";
