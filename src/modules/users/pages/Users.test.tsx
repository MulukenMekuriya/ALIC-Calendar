// @vitest-environment jsdom

/**
 * User Management tells the truth about whether it changed anything.
 *
 * The bug these exist for ran for months: public.user_organizations carried
 * only own-row RLS policies, so an admin's UPDATE matched zero rows, PostgREST
 * returned no error because nothing had gone wrong as far as it was concerned,
 * and the page said "User updated successfully". Every attempt to promote
 * somebody out of 'member' failed exactly this way, silently, and the fix was
 * reported to us as "the role doesn't save".
 *
 * The policies are restored in 20260322330000 and asserted there. What is
 * asserted HERE is the half that is not the database's job: if a write ever
 * changes nothing again, the screen has to say so.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const MD = "a0eebc99-md";

/** Rows the update statement claims to have changed. Empty = RLS refused. */
let updateReturns: Array<{ user_id: string }> = [];
let updateError: { message: string } | null = null;
const updates = vi.fn();

const roster = [
  { user_id: "u-abel", role: "admin" },
  { user_id: "u-tigist", role: "member" },
  { user_id: "u-elias", role: "contributor" },
];

const profiles = [
  { id: "u-abel", full_name: "Abel Alic", email: "abel@alic.org", phone_number: null, ministry_name: null },
  { id: "u-tigist", full_name: "Tigist Yaie", email: "tigist@gmail.com", phone_number: null, ministry_name: null },
  { id: "u-elias", full_name: "Elias Adera", email: "elias@alic.org", phone_number: null, ministry_name: "Alic MD Prayer" },
];

/**
 * A supabase stand-in that answers the four calls this page makes and records
 * the writes. Thenable, because the page awaits the builder directly.
 */
const makeBuilder = (table: string) => {
  const state: { table: string; op: string; values?: unknown; columns?: string } = {
    table,
    op: "select",
  };

  const result = () => {
    if (state.op === "update" && state.table === "user_organizations") {
      updates(state.values);
      return { data: updateReturns, error: updateError };
    }
    if (state.op === "upsert") return { data: [], error: null };
    if (state.table === "user_organizations") {
      // The admin-organisations query asks for the nested organisation.
      if ((state.columns || "").includes("organizations")) {
        return { data: [{ organization_id: MD, organizations: { id: MD, name: "ALIC MD" } }], error: null };
      }
      return { data: roster, error: null };
    }
    if (state.table === "profiles") return { data: profiles, error: null };
    return { data: [], error: null };
  };

  const api: Record<string, unknown> = {
    select: (columns?: string) => {
      state.columns = columns;
      return api;
    },
    update: (values: unknown) => {
      state.op = "update";
      state.values = values;
      return api;
    },
    upsert: (values: unknown) => {
      state.op = "upsert";
      state.values = values;
      return api;
    },
    eq: () => api,
    in: () => api,
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
  };

  return api;
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => makeBuilder(table),
    functions: { invoke: vi.fn().mockResolvedValue({ data: { user: { id: "new" } }, error: null }) },
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "t" } } }) },
  },
}));

vi.mock("@/shared/contexts/OrganizationContext", () => ({
  useOrganization: () => ({ currentOrganization: { id: MD, name: "ALIC MD" } }),
}));

vi.mock("@/shared/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u-abel" } }),
}));

// The layout drags in the whole nav, the router and every context with it.
vi.mock("@/shared/components/layout/DashboardLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const toast = vi.fn();
vi.mock("@/shared/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

import Users from "./Users";

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Users />
    </QueryClientProvider>,
  );
};

/**
 * The page renders a card list and a table, one hidden by CSS that jsdom does
 * not apply, so every name is in the document twice. The table is the one.
 */
const roll = async () => within(await screen.findByRole("table"));

/** Open Edit on one person and choose a tier for them. */
const editRoleOf = async (name: string, tier: string) => {
  const row = (await roll()).getByText(name).closest("tr")!;
  await userEvent.click(within(row).getAllByRole("button")[0]);

  await userEvent.click(screen.getByRole("combobox", { name: "" }));
  await userEvent.click(await screen.findByRole("option", { name: tier }));
  await userEvent.click(screen.getByRole("button", { name: /Update User/i }));
};


beforeAll(() => {
  // Radix's Select drives itself with pointer capture and scrollIntoView,
  // neither of which jsdom implements. Without these the listbox never opens
  // and every assertion below reads as "the option does not exist".
  window.HTMLElement.prototype.hasPointerCapture = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  updateReturns = [{ user_id: "u-tigist" }];
  updateError = null;
  toast.mockClear();
  updates.mockClear();
});

afterEach(cleanup);

describe("User Management, the roster", () => {
  it("opens on the people who have a job, not on the congregation", async () => {
    renderPage();

    const shown = await roll();
    expect(shown.getByText("Abel Alic")).toBeInTheDocument();
    expect(shown.getByText("Elias Adera")).toBeInTheDocument();
    // 589 of MD's 625 logins are plain members. They are a filter away.
    expect(shown.queryByText("Tigist Yaie")).toBeNull();
  });

  it("counts what is shown against what there is", async () => {
    renderPage();
    expect(await screen.findByText(/Users \(2 of 3\)/)).toBeInTheDocument();
  });

  it("finds a member once members are asked for", async () => {
    renderPage();
    await roll();

    await userEvent.click(screen.getAllByRole("combobox")[0]);
    await userEvent.click(await screen.findByRole("option", { name: "Everyone" }));

    await waitFor(async () =>
      expect((await roll()).getByText("Tigist Yaie")).toBeInTheDocument(),
    );
  });

  it("searches by name across whatever is showing", async () => {
    renderPage();
    await roll();

    await userEvent.type(
      screen.getByPlaceholderText(/Search name, email or ministry/i),
      "elias",
    );

    const shown = await roll();
    expect(shown.getByText("Elias Adera")).toBeInTheDocument();
    expect(shown.queryByText("Abel Alic")).toBeNull();
  });
});

describe("User Management, saving a role", () => {
  it("says the role was not changed when the write touched nothing", async () => {
    // Exactly the production state before 20260322330000: the UPDATE runs,
    // nothing errors, and no row is changed.
    updateReturns = [];
    renderPage();
    await roll();

    await editRoleOf("Elias Adera", "Board");

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Error",
          description: expect.stringMatching(/role was not changed/i),
          variant: "destructive",
        }),
      ),
    );
  });

  it("names the tier it actually set when the write lands", async () => {
    updateReturns = [{ user_id: "u-elias" }];
    renderPage();
    await roll();

    await editRoleOf("Elias Adera", "Board");

    await waitFor(() =>
      expect(updates).toHaveBeenCalledWith(expect.objectContaining({ role: "board" })),
    );
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "User updated",
          description: expect.stringMatching(/is now Board in ALIC MD/i),
        }),
      ),
    );
  });

  it("passes a database refusal through in the words the database used", async () => {
    // The last-admin guard raises its own message; swallowing it would leave
    // an admin staring at "An error occurred".
    updateError = {
      message: "This is the last admin of this branch. Make somebody else an admin first.",
    };
    renderPage();
    await roll();

    await editRoleOf("Abel Alic", "Member");

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: expect.stringMatching(/last admin of this branch/i),
        }),
      ),
    );
  });
});
