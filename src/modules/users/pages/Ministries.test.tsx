// @vitest-environment jsdom
/**
 * Ministries - OLD. What matters: a rename carries its logins with it, a
 * duplicate name is refused in words, and "remove" hides rather than deletes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const VA = "b1eebc99-va";

const writes = vi.fn();

const ministries = [
  { id: "m-choir", name: "Choir VA", is_active: true, leader_id: null },
  { id: "m-youth", name: "Youth VA", is_active: true, leader_id: null },
  { id: "m-it", name: "ALIC VA IT2", is_active: false, leader_id: null },
];

const makeBuilder = (table: string) => {
  const state: { op: string; values?: unknown; filters: Array<[string, unknown]> } = {
    op: "select",
    filters: [],
  };

  const result = () => {
    if (state.op !== "select") {
      writes({ table, op: state.op, values: state.values, filters: state.filters });
      return { data: [{ id: "x" }, { id: "y" }], error: null };
    }
    if (table === "ministries") return { data: ministries, error: null };
    return { data: [], error: null };
  };

  const api: Record<string, unknown> = {
    select: () => api,
    insert: (values: unknown) => ((state.op = "insert"), (state.values = values), api),
    update: (values: unknown) => ((state.op = "update"), (state.values = values), api),
    delete: () => ((state.op = "delete"), api),
    eq: (col: string, val: unknown) => (state.filters.push([col, val]), api),
    in: () => api,
    order: () => api,
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
  };
  return api;
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => makeBuilder(table),
    schema: () => ({ from: (table: string) => makeBuilder(table) }),
  },
}));

vi.mock("@/shared/contexts/OrganizationContext", () => ({
  useOrganization: () => ({ currentOrganization: { id: VA, name: "ALIC VA" } }),
}));

vi.mock("@/shared/components/layout/DashboardLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const toast = vi.fn();
vi.mock("@/shared/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

import Ministries from "./Ministries";

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Ministries />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  writes.mockClear();
  toast.mockClear();
});

afterEach(cleanup);

describe("Ministries - OLD", () => {
  it("lists active ministries before hidden ones", async () => {
    renderPage();
    const table = within(await screen.findByRole("table"));
    const names = table.getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("cell")[0].textContent);
    expect(names).toEqual(["Choir VA", "Youth VA", "ALIC VA IT2"]);
    expect(screen.getByText(/2 active · 1 hidden/)).toBeInTheDocument();
  });

  it("adds a ministry to this branch, tidying the spaces", async () => {
    renderPage();
    await screen.findByRole("table");

    await userEvent.click(screen.getByRole("button", { name: /Add Ministry/i }));
    await userEvent.type(screen.getByLabelText(/Name/), "  Ushers   VA ");
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Add Ministry/i }));

    await waitFor(() =>
      expect(writes).toHaveBeenCalledWith(
        expect.objectContaining({
          table: "ministries",
          op: "insert",
          values: { organization_id: VA, name: "Ushers VA", is_active: true },
        }),
      ),
    );
  });

  it("renames, and moves the logins on the old name to the new one", async () => {
    renderPage();
    await screen.findByRole("table");

    await userEvent.click(screen.getByRole("button", { name: "Rename Choir VA" }));
    const field = screen.getByLabelText(/Name/);
    await userEvent.clear(field);
    await userEvent.type(field, "Worship VA");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(writes).toHaveBeenCalledWith(
        expect.objectContaining({
          table: "profiles",
          op: "update",
          values: { ministry_name: "Worship VA" },
          filters: [["ministry_name", "Choir VA"]],
        }),
      ),
    );
    expect(writes).toHaveBeenCalledWith(
      expect.objectContaining({ table: "ministries", op: "update", filters: [["id", "m-choir"]] }),
    );
  });

  it("refuses a name already on the list, ignoring case", async () => {
    renderPage();
    await screen.findByRole("table");

    await userEvent.click(screen.getByRole("button", { name: /Add Ministry/i }));
    await userEvent.type(screen.getByLabelText(/Name/), "youth va");
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Add Ministry/i }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "That name is taken" })),
    );
    expect(writes).not.toHaveBeenCalled();
  });

  it("points at Restore when the name belongs to a hidden ministry", async () => {
    renderPage();
    await screen.findByRole("table");

    await userEvent.click(screen.getByRole("button", { name: /Add Ministry/i }));
    await userEvent.type(screen.getByLabelText(/Name/), "ALIC VA IT2");
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Add Ministry/i }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ description: expect.stringMatching(/hidden\. Restore it/) }),
      ),
    );
  });

  it("hides rather than deletes, and restores", async () => {
    renderPage();
    await screen.findByRole("table");

    await userEvent.click(screen.getByRole("button", { name: "Hide Youth VA" }));
    await waitFor(() =>
      expect(writes).toHaveBeenCalledWith(
        expect.objectContaining({
          table: "ministries",
          op: "update",
          values: expect.objectContaining({ is_active: false }),
        }),
      ),
    );

    await userEvent.click(screen.getByRole("button", { name: "Restore ALIC VA IT2" }));
    await waitFor(() =>
      expect(writes).toHaveBeenCalledWith(
        expect.objectContaining({ values: expect.objectContaining({ is_active: true }) }),
      ),
    );
    expect(writes).not.toHaveBeenCalledWith(expect.objectContaining({ op: "delete" }));
  });
});
