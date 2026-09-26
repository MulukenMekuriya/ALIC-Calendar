import { describe, it, expect } from "vitest";
import {
  IDLE_BEFORE_RELOAD_MS,
  decideReload,
  entryScriptFrom,
  updateModeForPath,
  type ReloadConditions,
} from "./buildVersion";

describe("entryScriptFrom", () => {
  it("finds the hashed bundle Vite emits", () => {
    const html = `<!doctype html><html><head>
      <link rel="stylesheet" href="/assets/index-abc.css">
      </head><body><div id="root"></div>
      <script type="module" crossorigin src="/assets/index-DEbcyN7i.js"></script>
      </body></html>`;

    expect(entryScriptFrom(html)).toBe("/assets/index-DEbcyN7i.js");
  });

  it("does not mind which order the attributes come in", () => {
    expect(
      entryScriptFrom(`<script src="/assets/index-x.js" type="module"></script>`),
    ).toBe("/assets/index-x.js");
    expect(entryScriptFrom(`<script type='module' src='/assets/q.js'></script>`)).toBe(
      "/assets/q.js",
    );
  });

  it("ignores scripts that are not the entry module", () => {
    const html = `<script src="/analytics.js"></script>`;
    expect(entryScriptFrom(html)).toBeNull();
  });

  it("says nothing rather than guessing when handed something else", () => {
    // A captive-portal page, an error page, an empty body: none of these mean
    // "there is a new build", and treating them as one would reload forever.
    expect(entryScriptFrom("")).toBeNull();
    expect(entryScriptFrom("<html><body>502 Bad Gateway</body></html>")).toBeNull();
  });
});

describe("decideReload", () => {
  const conditions = (over: Partial<ReloadConditions> = {}): ReloadConditions => ({
    hasNewBuild: true,
    mode: "auto",
    busy: false,
    idleForMs: IDLE_BEFORE_RELOAD_MS,
    visible: true,
    alreadyReloaded: false,
    ...over,
  });

  it("does nothing when the build has not changed", () => {
    expect(decideReload(conditions({ hasNewBuild: false }))).toBe("wait");
    expect(decideReload(conditions({ hasNewBuild: false, visible: false }))).toBe("wait");
  });

  it("never reloads mid-check-in, however idle the device looks", () => {
    // The kiosk sets busy while a family is on screen. A reload there loses
    // the pick-up code in front of the parent waiting to be given it.
    expect(decideReload(conditions({ busy: true }))).toBe("wait");
    expect(decideReload(conditions({ busy: true, visible: false }))).toBe("wait");
    expect(decideReload(conditions({ busy: true, idleForMs: 999_999 }))).toBe("wait");
  });

  it("takes the new code while nobody is looking", () => {
    expect(decideReload(conditions({ visible: false, idleForMs: 0 }))).toBe("reload");
    expect(decideReload(conditions({ visible: false, mode: "prompt" }))).toBe("reload");
  });

  it("waits for an unattended screen to go quiet", () => {
    expect(decideReload(conditions({ idleForMs: 0 }))).toBe("wait");
    expect(decideReload(conditions({ idleForMs: IDLE_BEFORE_RELOAD_MS - 1 }))).toBe("wait");
    expect(decideReload(conditions({ idleForMs: IDLE_BEFORE_RELOAD_MS }))).toBe("reload");
  });

  it("asks at a desk instead of reloading under somebody", () => {
    // Two minutes of stillness at a desk means reading, not absence.
    expect(decideReload(conditions({ mode: "prompt" }))).toBe("offer");
    expect(decideReload(conditions({ mode: "prompt", idleForMs: 999_999 }))).toBe("offer");
  });
});

describe("updateModeForPath", () => {
  it("reloads the screens nobody is standing at", () => {
    expect(updateModeForPath("/kiosk")).toBe("auto");
    expect(updateModeForPath("/checkin")).toBe("auto");
    expect(updateModeForPath("/checkout")).toBe("auto");
    expect(updateModeForPath("/welcome/register")).toBe("auto");
  });

  it("asks everywhere somebody might be typing", () => {
    expect(updateModeForPath("/budget")).toBe("prompt");
    expect(updateModeForPath("/event-reviews")).toBe("prompt");
    expect(updateModeForPath("/members/new")).toBe("prompt");
    expect(updateModeForPath("/")).toBe("prompt");
  });

  it("does not match a route by prefix alone", () => {
    // /checkins-report is not the check-in station.
    expect(updateModeForPath("/checkins-report")).toBe("prompt");
  });
});

describe("decideReload, the loop guard", () => {
  const conditions = (over: Partial<ReloadConditions> = {}): ReloadConditions => ({
    hasNewBuild: true,
    mode: "auto",
    busy: false,
    idleForMs: IDLE_BEFORE_RELOAD_MS,
    visible: true,
    alreadyReloaded: false,
    ...over,
  });

  it("reloads an unattended screen once", () => {
    expect(decideReload(conditions())).toBe("reload");
  });

  it("will not reload a second time for the same build", () => {
    // If a reload did not resolve the mismatch, doing it again is a loop on an
    // unattended screen in a lobby. Stop, and put it in front of a person.
    expect(decideReload(conditions({ alreadyReloaded: true }))).toBe("offer");
    expect(decideReload(conditions({ alreadyReloaded: true, visible: false }))).toBe(
      "offer",
    );
  });

  it("still refuses to interrupt a check-in, guard or no guard", () => {
    expect(decideReload(conditions({ alreadyReloaded: true, busy: true }))).toBe("wait");
  });
});
