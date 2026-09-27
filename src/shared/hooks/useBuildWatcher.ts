/**
 * Watches for a newer build and takes it when taking it is free.
 *
 * The effectful half of buildVersion.ts, which holds the policy. This part is
 * only plumbing: when to look, what to compare, and how to notice that the
 * screen has gone quiet.
 *
 * WHEN IT LOOKS. Every fifteen minutes, and whenever the tab comes back to the
 * foreground — which on an iPad is the moment a volunteer picks it up, and the
 * moment a device that slept through a deploy wakes into it. A check is one
 * conditional GET of index.html.
 *
 * WHAT IT DOES NOT DO. It never reloads a busy screen, and never reloads a
 * staffed one without asking. See decideReload.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BUSY_ATTRIBUTE,
  currentEntryScript,
  decideReload,
  entryScriptFrom,
  type UpdateMode,
} from "@/shared/lib/buildVersion";

const CHECK_EVERY_MS = 15 * 60 * 1000;

/**
 * Remembers, across the reload itself, that this tab has already taken one.
 * sessionStorage and not localStorage: it is a property of this tab's life,
 * and a device that is power-cycled deserves a fresh attempt.
 */
const RELOADED_KEY = "alic:build-reloaded-for";

/** Long enough that picking the iPad up does not fire a second fetch. */
const MIN_GAP_BETWEEN_CHECKS_MS = 60 * 1000;

export interface BuildWatcher {
  /** A newer build is being served and we are still on the old one. */
  updateReady: boolean;
  /** Take it now. Bound to the button on the banner. */
  reloadNow: () => void;
}

export function useBuildWatcher(mode: UpdateMode): BuildWatcher {
  const [updateReady, setUpdateReady] = useState(false);

  const running = useRef<string | null>(null);
  const lastChecked = useRef(0);
  const lastInteraction = useRef(Date.now());

  // Read once: this is the bundle this document actually loaded, and it does
  // not change without a reload.
  if (running.current === null) running.current = currentEntryScript();

  const reloadNow = useCallback(() => {
    window.location.reload();
  }, []);

  /** Has this tab already reloaded itself for the build now being served? */
  const alreadyReloadedFor = (served: string): boolean => {
    try {
      return sessionStorage.getItem(RELOADED_KEY) === served;
    } catch {
      // Private mode, blocked storage. Treat it as "we have reloaded before"
      // so the worst case is a banner rather than a loop nobody can stop.
      return true;
    }
  };

  const rememberReload = (served: string) => {
    try {
      sessionStorage.setItem(RELOADED_KEY, served);
    } catch {
      /* nothing to do: the check above fails safe */
    }
  };

  const check = useCallback(async () => {
    // Nothing to compare against — a test harness, or a document built some
    // other way. Silence is the right answer, not a reload loop.
    if (!running.current) return;

    const now = Date.now();
    if (now - lastChecked.current < MIN_GAP_BETWEEN_CHECKS_MS) return;
    lastChecked.current = now;

    let served: string | null = null;
    try {
      // The query string defeats anything between here and the origin; the
      // rewrite serves index.html for every path, so "/" is the document.
      const response = await fetch(`/?build-check=${now}`, {
        cache: "no-store",
        headers: { Accept: "text/html" },
      });

      if (!response.ok) return;

      served = entryScriptFrom(await response.text());
    } catch {
      // Offline, captive portal, a flaky church wifi. Try again next time.
      return;
    }

    if (!served || served === running.current) return;

    const decision = decideReload({
      hasNewBuild: true,
      mode,
      busy: document.body.getAttribute(BUSY_ATTRIBUTE) === "true",
      idleForMs: Date.now() - lastInteraction.current,
      visible: document.visibilityState === "visible",
      alreadyReloaded: alreadyReloadedFor(served),
    });

    if (decision === "reload") {
      rememberReload(served);
      window.location.reload();
      return;
    }

    // "offer" puts the banner up. "wait" leaves it for the next check, by
    // which time the screen may be quiet or the person may have gone home.
    setUpdateReady(decision === "offer");
  }, [mode]);

  useEffect(() => {
    const touched = () => {
      lastInteraction.current = Date.now();
    };

    const events: Array<keyof WindowEventMap> = [
      "pointerdown",
      "keydown",
      "touchstart",
    ];
    events.forEach((event) =>
      window.addEventListener(event, touched, { passive: true }),
    );

    // BOTH DIRECTIONS. Coming back is when a volunteer picks the iPad up, and
    // when a device that slept through a deploy wakes into it. GOING AWAY is
    // better still: nobody is looking, so a reload costs nothing and the
    // screen they return to is already the new one.
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") touched();
      void check();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    const timer = window.setInterval(() => void check(), CHECK_EVERY_MS);

    return () => {
      events.forEach((event) => window.removeEventListener(event, touched));
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.clearInterval(timer);
    };
  }, [check]);

  return { updateReady, reloadNow };
}

/**
 * Declare that this screen is mid-something.
 *
 * The kiosk holds it while a family is on screen — a reload there would take
 * the pick-up code away from the parent standing waiting for it.
 */
export function useAppBusy(busy: boolean): void {
  useEffect(() => {
    if (!busy) return;

    document.body.setAttribute(BUSY_ATTRIBUTE, "true");
    return () => document.body.removeAttribute(BUSY_ATTRIBUTE);
  }, [busy]);
}
