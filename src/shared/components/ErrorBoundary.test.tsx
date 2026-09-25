// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";

/**
 * The crash this exists for, reproduced exactly.
 *
 * Deploying the database ahead of the frontend would have left the live bundle
 * calling `person.background_check_status.replace(...)` on a column the new
 * migration removes. `undefined.replace` is a TypeError thrown during render,
 * and with no boundary anywhere in the app that unmounted the entire root.
 */
function CrashesLikeVolunteersTabDid({ person }: { person: { background_check_status?: string } }) {
  return <p>{`Background check: ${person.background_check_status!.replace("_", " ")}`}</p>;
}

// No global setup file in this repo, so each test cleans up after itself;
// otherwise the boundary from the previous render is still mounted and every
// query finds two of everything.
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ErrorBoundary", () => {
  it("renders its children when nothing is wrong", () => {
    render(
      <ErrorBoundary>
        <p>the check-in desk</p>
      </ErrorBoundary>
    );
    expect(screen.queryByText("the check-in desk")).not.toBeNull();
  });

  it("catches the exact missing-column TypeError instead of blanking", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary what="the volunteers list">
        <CrashesLikeVolunteersTabDid person={{}} />
      </ErrorBoundary>
    );
    // Something is on the screen, and it names where the fault was.
    expect(screen.queryByText(/Something went wrong in the volunteers list/)).not.toBeNull();
    // And it does not blame the person reading it.
    expect(screen.queryByText(/Nothing you did caused this/)).not.toBeNull();
  });

  it("offers a way out rather than only an apology", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <CrashesLikeVolunteersTabDid person={{}} />
      </ErrorBoundary>
    );
    expect(screen.queryByRole("button", { name: /Try again/ })).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Reload/ })).not.toBeNull();
  });

  it("shows the message so a volunteer can read it out", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <CrashesLikeVolunteersTabDid person={{}} />
      </ErrorBoundary>
    );
    expect(screen.queryByText(/replace/)).not.toBeNull();
  });

  it("prefers a caller-supplied fallback", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary fallback={<p>the paper backup sheet</p>}>
        <CrashesLikeVolunteersTabDid person={{}} />
      </ErrorBoundary>
    );
    expect(screen.queryByText("the paper backup sheet")).not.toBeNull();
  });
});
