// @vitest-environment jsdom

/**
 * A member who cannot get in is told why, in the form, and it stays there.
 *
 * The failure this guards is silent by construction. GoTrue's refusal used to
 * go into a toast: it appeared in a corner, said "Invalid login credentials",
 * and removed itself after a few seconds while the person was still looking at
 * the password field. Nothing about that is visible to a test that only checks
 * the request was made, so these check the screen instead.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
// No global setup file in this repo, so the matchers are registered here.
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const signInWithPassword = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signInWithPassword: (...a: unknown[]) => signInWithPassword(...a) } },
}));

const navigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigate };
});

import Auth from "./Auth";

const renderAuth = (at = "/auth") =>
  render(
    <MemoryRouter initialEntries={[at]}>
      <Auth />
    </MemoryRouter>,
  );

const fillIn = async (user: ReturnType<typeof userEvent.setup>, pw = "hunter2") => {
  await user.type(screen.getByLabelText(/email address/i), "member@alic.org");
  await user.type(screen.getByLabelText(/^password$/i), pw);
};

describe("Auth sign-in failures", () => {
  beforeEach(() => {
    signInWithPassword.mockReset();
    navigate.mockReset();
  });

  // vitest `globals` is off in this repo, so Testing Library never registers
  // its own afterEach. Without this each render stacks another copy of the
  // form onto document.body and every query finds two of everything.
  afterEach(cleanup);

  it("puts the reason in the form, not in a toast that leaves", async () => {
    signInWithPassword.mockResolvedValue({
      error: { code: "invalid_credentials", status: 400, message: "Invalid login credentials" },
    });
    const user = userEvent.setup();
    renderAuth();

    await fillIn(user);
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/wrong email or password/i);
    expect(navigate).not.toHaveBeenCalled();

    // Still there a moment later — a toast would have begun dismissing itself.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("retracts the reason as soon as the member retypes", async () => {
    signInWithPassword.mockResolvedValue({
      error: { code: "invalid_credentials", status: 400, message: "Invalid login credentials" },
    });
    const user = userEvent.setup();
    renderAuth();

    await fillIn(user);
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    await screen.findByRole("alert");

    await user.type(screen.getByLabelText(/^password$/i), "3");
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("explains a half-typed password instead of greying the button out", async () => {
    const user = userEvent.setup();
    renderAuth();

    await fillIn(user, "abc");
    const button = screen.getByRole("button", { name: /sign in/i });
    expect(button).not.toBeDisabled();

    await user.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent(/incomplete/i);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("blames the network, not the password, when the request never lands", async () => {
    signInWithPassword.mockResolvedValue({
      error: { name: "AuthRetryableFetchError", message: "Failed to fetch" },
    });
    const user = userEvent.setup();
    renderAuth();

    await fillIn(user);
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/could not reach/i);
    expect(alert).not.toHaveTextContent(/wrong email or password/i);
  });

  it("offers the reset link from inside the message", async () => {
    signInWithPassword.mockResolvedValue({
      error: { code: "invalid_credentials", status: 400, message: "Invalid login credentials" },
    });
    const user = userEvent.setup();
    renderAuth();

    await fillIn(user);
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    await screen.findByRole("alert");

    await user.click(screen.getByRole("button", { name: /reset your password/i }));
    expect(navigate).toHaveBeenCalledWith("/forgot-password");
  });

  it("announces the failure to a screen reader, whose focus never moved", async () => {
    signInWithPassword.mockResolvedValue({
      error: { code: "invalid_credentials", status: 400, message: "Invalid login credentials" },
    });
    const user = userEvent.setup();
    const { container } = renderAuth();

    await fillIn(user);
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    await screen.findByRole("alert");

    const live = container.querySelector('[aria-live="assertive"]');
    expect(live?.contains(screen.getByRole("alert"))).toBe(true);
  });
});

describe("Auth sign-in success", () => {
  beforeEach(() => {
    signInWithPassword.mockReset();
    navigate.mockReset();
    signInWithPassword.mockResolvedValue({ error: null });
  });
  afterEach(cleanup);

  it("returns a parent to the consent form their email link opened", async () => {
    const user = userEvent.setup();
    renderAuth("/auth?next=%2Fmy%3Ftab%3Dchildren%26consent%3D1");
    await fillIn(user);
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    await vi.waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("/my?tab=children&consent=1", { replace: true }),
    );
  });

  it("refuses to send anyone off the site, and goes to the dashboard instead", async () => {
    const user = userEvent.setup();
    renderAuth("/auth?next=https%3A%2F%2Fevil.example%2F");
    await fillIn(user);
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith("/dashboard", { replace: true }));
  });
});
