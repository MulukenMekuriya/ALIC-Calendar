// @vitest-environment jsdom

/**
 * "All Expense Requests" on the Overview folds away, and nothing else does.
 *
 * What is under test is the wiring in BudgetOverview: which list sits inside
 * the fold, what the folded header says, and that a header search holds it
 * open. The fold itself is tested in CollapsibleListSection.test.tsx. The
 * charts and the lists are stand-ins: none of them is the point here.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  AllocationRequestWithRelations,
  ExpenseRequestWithRelations,
} from "../types";

let searchQuery = "";

vi.mock("@/shared/contexts/SearchContext", () => ({
  useSearch: () => ({ searchQuery }),
}));

vi.mock("./BudgetSection", () => ({ default: () => <div>budget section</div> }));
vi.mock("./MinistryBudgetSummary", () => ({
  MinistryBudgetSummary: () => <div>ministry summary</div>,
}));
vi.mock("./ExpenseList", () => ({
  ExpenseList: ({ expenses }: { expenses: unknown[] }) => (
    <div>expense list of {expenses.length}</div>
  ),
}));
vi.mock("./AllocationRequestList", () => ({
  AllocationRequestList: () => <div>allocation list</div>,
}));

// Node's own half-implemented localStorage shadows jsdom's and reads as
// undefined here; the section copes, which is also how it is run in practice
// when storage is blocked. These tests do not need to remember anything.
vi.stubGlobal("localStorage", undefined);

import BudgetOverview from "./BudgetOverview";

const expense = (id: string, amount: number, status = "pending_leader") =>
  ({ id, amount, status }) as unknown as ExpenseRequestWithRelations;

const allocation = (id: string) =>
  ({
    id,
    requested_amount: 1000,
    status: "pending",
  }) as unknown as AllocationRequestWithRelations;

const fold = () =>
  screen.getByRole("button", { name: /^(Collapse|Expand) All Expense Requests$/ });

beforeEach(() => {
  searchQuery = "";
});

afterEach(cleanup);

describe("BudgetOverview, the expense list", () => {
  it("puts the list under a heading that folds it away", async () => {
    render(
      <BudgetOverview
        expenses={[expense("a", 100), expense("b", 250)]}
        allocations={[]}
        showDetailedLists
      />,
    );

    expect(screen.getByRole("heading", { name: "All Expense Requests" })).toBeInTheDocument();
    expect(screen.getByText("expense list of 2")).toBeVisible();

    await userEvent.click(fold());

    expect(screen.getByText("expense list of 2")).not.toBeVisible();
  });

  it("says how many requests and how much while it is folded", async () => {
    render(
      <BudgetOverview
        expenses={[expense("a", 100), expense("b", 250)]}
        allocations={[]}
        showDetailedLists
      />,
    );

    expect(screen.queryByText("2 requests · $350")).toBeNull();

    await userEvent.click(fold());

    expect(screen.getByText("2 requests · $350")).toBeVisible();
  });

  it("says request, not requests, for one", async () => {
    render(
      <BudgetOverview expenses={[expense("a", 100)]} allocations={[]} showDetailedLists />,
    );

    await userEvent.click(fold());

    expect(screen.getByText("1 request · $100")).toBeVisible();
  });

  it("leaves cancelled requests out of what it counts", async () => {
    render(
      <BudgetOverview
        expenses={[expense("a", 100), expense("b", 999, "cancelled")]}
        allocations={[]}
        showDetailedLists
      />,
    );

    await userEvent.click(fold());

    expect(screen.getByText("1 request · $100")).toBeVisible();
  });

  it("holds the list open while there is a header search", async () => {
    searchQuery = "deacon";
    render(
      <BudgetOverview expenses={[expense("a", 100)]} allocations={[]} showDetailedLists />,
    );

    expect(screen.getByText("expense list of 1")).toBeVisible();
    expect(fold()).toBeDisabled();
  });

  it("treats a search of only spaces as no search", () => {
    searchQuery = "   ";
    render(
      <BudgetOverview expenses={[expense("a", 100)]} allocations={[]} showDetailedLists />,
    );

    expect(fold()).toBeEnabled();
  });
});

describe("BudgetOverview, what does not fold", () => {
  it("has no fold button when the detailed lists are not shown", () => {
    render(<BudgetOverview expenses={[expense("a", 100)]} allocations={[]} />);

    expect(screen.queryByRole("button", { name: /^(Collapse|Expand) / })).toBeNull();
    expect(screen.queryByText("expense list of 1")).toBeNull();
  });

  it("does not fold the budget requests list", () => {
    render(
      <BudgetOverview expenses={[]} allocations={[allocation("a")]} showDetailedLists />,
    );

    expect(screen.getByRole("heading", { name: "All Budget Requests" })).toBeInTheDocument();
    expect(screen.getByText("allocation list")).toBeVisible();
    expect(screen.queryByRole("button", { name: /^(Collapse|Expand) / })).toBeNull();
  });
});
