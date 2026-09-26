// @vitest-environment jsdom

/**
 * The half of the stale-build watcher that talks to the network and to
 * window.location — where a mistake is either "never notices" or, far worse,
 * "reloads a lobby kiosk in a loop".
 *
 * The policy itself is in buildVersion.test.ts. These check the wiring: that a
 * check happens when the tab comes forward, that it compares the right two
 * things, and that reloading is bounded.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { BUSY_ATTRIBUTE } from "@/shared/lib/buildVersion";
import { useBuildWatcher } from "./useBuildWatcher";

const RUNNING = "/assets/index-OLD.js";

const pageServing = (entry: string) =>
  `<!doctype html><html><body><div id="root"></div>` +
  `<script type="module" crossorigin src="${entry}"></script></body></html>`;

const reload = vi.fn();
let visibility: DocumentVisibilityState = "visible";

/** The <script> tag the document itself loaded. */
const mountRunningScript = () => {
  const script = document.createElement("script");
  script.type = "module";
  script.setAttribute("src", RUNNING);
  document.head.appendChild(script);
};

/** A visibility change in either direction, which is what triggers a check. */
const comeBackToTheTab = async () => {
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
};

beforeEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  document.body.removeAttribute(BUSY_ATTRIBUTE);
  mountRunningScript();

  visibility = "visible";
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibility,
  });

  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, reload },
  });

  sessionStorage.clear();
  reload.mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const servesEntry = (entry: string) =>
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, text: async () => pageServing(entry) }),
  );

describe("useBuildWatcher", () => {
  it("does nothing while the served build is the one running", async () => {
    servesEntry(RUNNING);
    const { result } = renderHook(() => useBuildWatcher("auto"));

    await comeBackToTheTab();

    expect(reload).not.toHaveBeenCalled();
    expect(result.current.updateReady).toBe(false);
  });

  it("reloads an unattended screen that nobody is looking at", async () => {
    servesEntry("/assets/index-NEW.js");
    visibility = "hidden";
    renderHook(() => useBuildWatcher("auto"));

    // The tab has just gone away, which is the moment the reload is free.
    await comeBackToTheTab();

    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });

  it("offers rather than reloads at a staffed desk", async () => {
    servesEntry("/assets/index-NEW.js");
    const { result } = renderHook(() => useBuildWatcher("prompt"));

    await comeBackToTheTab();

    await waitFor(() => expect(result.current.updateReady).toBe(true));
    expect(reload).not.toHaveBeenCalled();
  });

  it("leaves a busy screen alone", async () => {
    servesEntry("/assets/index-NEW.js");
    document.body.setAttribute(BUSY_ATTRIBUTE, "true");
    visibility = "hidden";
    const { result } = renderHook(() => useBuildWatcher("auto"));

    await comeBackToTheTab();

    expect(reload).not.toHaveBeenCalled();
    expect(result.current.updateReady).toBe(false);
  });

  it("will not reload twice for the same build", async () => {
    // The tab has already taken one reload for this exact bundle and is still
    // running the old one. Something is wrong that reloading does not fix.
    sessionStorage.setItem("alic:build-reloaded-for", "/assets/index-NEW.js");
    servesEntry("/assets/index-NEW.js");
    visibility = "hidden";
    const { result } = renderHook(() => useBuildWatcher("auto"));

    await comeBackToTheTab();

    expect(reload).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.updateReady).toBe(true));
  });

  it("records the build it reloaded for, so the guard can work after the reload", async () => {
    servesEntry("/assets/index-NEW.js");
    visibility = "hidden";
    renderHook(() => useBuildWatcher("auto"));

    await comeBackToTheTab();

    await waitFor(() =>
      expect(sessionStorage.getItem("alic:build-reloaded-for")).toBe(
        "/assets/index-NEW.js",
      ),
    );
  });

  it("says nothing when the network does not answer", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const { result } = renderHook(() => useBuildWatcher("auto"));

    await comeBackToTheTab();

    expect(reload).not.toHaveBeenCalled();
    expect(result.current.updateReady).toBe(false);
  });

  it("ignores a page that is not the app", async () => {
    // A captive portal answering 200 with its own login page must not read as
    // "a new build" and reload the kiosk into it forever.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => "<html><body>Sign in to continue</body></html>",
      }),
    );
    const { result } = renderHook(() => useBuildWatcher("auto"));

    await comeBackToTheTab();

    expect(reload).not.toHaveBeenCalled();
    expect(result.current.updateReady).toBe(false);
  });

  it("does not hammer the origin when the tab is flicked back and forth", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue({ ok: true, text: async () => pageServing(RUNNING) });
    vi.stubGlobal("fetch", fetchSpy);
    renderHook(() => useBuildWatcher("auto"));

    await comeBackToTheTab();
    await comeBackToTheTab();
    await comeBackToTheTab();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
