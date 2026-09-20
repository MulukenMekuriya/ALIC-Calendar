// @vitest-environment jsdom

/**
 * Setting a password through the emailed link is not followed by being told
 * you still hold a temporary one.
 *
 * The failure these guard is two screens apart, which is why it survived. A
 * member scans the QR code, is found in the directory, gets a recovery link,
 * types a new password on /reset-password — and lands on a ProtectedRoute,
 * which reads profiles.must_change_password before anything else renders and
 * shows ForcePasswordChange: "your account was set up with a temporary
 * password… please replace it". They just did. The 542 members imported from
 * Breeze all carry that flag (their own mobile number was the starter
 * password), so this was every one of them.
 *
 * Nothing about it is visible to a test of the reset form, which only sees
 * updateUser succeed. So these check what happens after it succeeds.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const updateUser = vi.fn();
const rpc = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      updateUser: (...a: unknown[]) => updateUser(...a),
      // The provider subscribes and asks for a session on mount; neither is
      // what is under test, so both answer "nobody signed in" and stop.
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
      getSession: () => Promise.resolve({ data: { session: null } }),
      signOut: () => Promise.resolve({ error: null }),
    },
    rpc: (...a: unknown[]) => rpc(...a),
    from: () => ({
      select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
    }),
  },
}));

import { AuthProvider, useAuth } from "./AuthContext";

/** Reports what updatePassword returned, since that is what the page acts on. */
let result: { error: Error | null } | null = null;

const Probe = () => {
  const { updatePassword } = useAuth();
  return (
    <button
      onClick={async () => {
        result = await updatePassword("a-password-they-chose");
      }}
    >
      set password
    </button>
  );
};

const renderProbe = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );

const clearCalls = () =>
  rpc.mock.calls.filter((c) => c[0] === "clear_password_change_required");

describe("updatePassword", () => {
  beforeEach(() => {
    updateUser.mockReset();
    rpc.mockReset();
    result = null;
  });

  // vitest `globals` is off in this repo, so Testing Library never registers
  // its own afterEach.
  afterEach(cleanup);

  it("clears the forced-change flag, so the app does not ask a second time", async () => {
    updateUser.mockResolvedValue({ error: null });
    rpc.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    renderProbe();

    await user.click(screen.getByRole("button", { name: /set password/i }));

    await waitFor(() => expect(clearCalls()).toHaveLength(1));
    expect(result).toEqual({ error: null });
  });

  it("leaves the flag alone when the password did not actually change", async () => {
    const error = new Error("New password should be different from the old password.");
    updateUser.mockResolvedValue({ error });
    const user = userEvent.setup();
    renderProbe();

    await user.click(screen.getByRole("button", { name: /set password/i }));

    await waitFor(() => expect(result).toEqual({ error }));
    expect(clearCalls()).toHaveLength(0);
  });

  it("still reports success if the flag cannot be cleared — the password is set", async () => {
    updateUser.mockResolvedValue({ error: null });
    rpc.mockResolvedValue({ error: { message: "permission denied" } });
    const user = userEvent.setup();
    renderProbe();

    await user.click(screen.getByRole("button", { name: /set password/i }));

    // The gate stays shut rather than opening on a failed write: the member
    // sees ForcePasswordChange once and can change it there.
    await waitFor(() => expect(result).toEqual({ error: null }));
    expect(clearCalls()).toHaveLength(1);
  });
});
