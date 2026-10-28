// @vitest-environment jsdom

/**
 * The by-month review, as the local leaders and as the Board.
 *
 * Hooks are stand-ins; what is under test is what the screen offers each role,
 * which rows each button acts on, and the order of saving a typed note and
 * acting on the batch.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AllocationRequestWithRelations } from "../../types";

const calls: string[] = [];
let role: "admin" | "board" = "board";
let requests: AllocationRequestWithRelations[] = [];

vi.mock("@/shared/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1", email: "b@alic.org" } }) }));
vi.mock("@/shared/contexts/OrganizationContext", () => ({
  useOrganization: () => ({
    userOrganizations: [{ organization_id: "md", role, organization: { name: "ALIC MD" } }],
  }),
}));
vi.mock("@/hooks/useUserProfile", () => ({ useUserProfile: () => ({ profile: { full_name: "Board Member" } }) }));
vi.mock("@/shared/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("../AllocationRequestForm", () => ({ AllocationRequestForm: () => null }));
vi.mock("./MonthEditorDialog", () => ({ MonthEditorDialog: () => null }));

const mutation = (name: string, result: unknown) => ({
  mutateAsync: vi.fn(async (arg: unknown) => {
    calls.push(`${name}:${JSON.stringify(arg)}`);
    return result;
  }),
  isPending: false,
});
const saveFeedback = mutation("save", {});
const decideMany = mutation("decide", { moved: 1, skipped: [] });
const sendToBoard = mutation("send", 1);
const council = mutation("council", {});

vi.mock("../../hooks/useBoardReview", () => ({
  useAllocationRequestsAcrossBranches: () => ({ data: requests, isLoading: false }),
  useBoardFeedback: () => ({ data: [] }),
  useSaveBoardFeedback: () => saveFeedback,
  useBoardDecideMany: () => decideMany,
  useSendToBoard: () => sendToBoard,
  useCouncilDecision: () => council,
}));

import { BudgetReviewSection } from "./BudgetReviewSection";

const req = (id: string, ministry: string, status: string, jan: number): AllocationRequestWithRelations =>
  ({
    id,
    organization_id: "md",
    ministry_id: id,
    ministry: { name: ministry },
    status,
    board_round: status === "board_review" ? 1 : 0,
    period_type: "monthly",
    requested_amount: jan,
    updated_at: "2026-01-01T00:00:00Z",
    budget_breakdown: [
      { category: "monthly_budget_item", description: "Supplies", amount: jan, monthly_data: { chart_of_accounts: "6000", jan } },
    ],
  }) as unknown as AllocationRequestWithRelations;

const renderIt = () => render(<BudgetReviewSection year={2027} organizationIds={["md"]} />);

beforeEach(() => {
  calls.length = 0;
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("as the Board", () => {
  beforeEach(() => {
    role = "board";
    requests = [
      req("a", "Deacons", "board_review", 400),
      req("b", "Choir", "board_review", 900),
      req("c", "Youth", "pending", 123),
      req("d", "Kids", "conditionally_approved", 321),
    ];
  });

  it("shows only what was sent to it", () => {
    renderIt();
    expect(screen.getAllByText("Deacons").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Choir").length).toBeGreaterThan(0);
    expect(screen.queryByText("Youth")).toBeNull();
    expect(screen.queryByText("Kids")).toBeNull();
  });

  it("offers no way to edit a figure", () => {
    renderIt();
    expect(screen.queryByRole("button", { name: /^Edit / })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Approve .* for the Board/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Deny / })).toBeNull();
    expect(screen.queryByRole("button", { name: /Send for Board Review/ })).toBeNull();
  });

  it("starts with every row ticked and acts only on the ticked ones", async () => {
    renderIt();
    expect(screen.getByRole("button", { name: "Final approval (2)" })).toBeEnabled();

    const boxes = screen.getAllByRole("checkbox", { name: "Select Choir" });
    await userEvent.click(boxes[0]);
    expect(screen.getByRole("button", { name: "Final approval (1)" })).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "Final approval (1)" }));
    await userEvent.click(screen.getByRole("button", { name: "Give final approval" }));
    expect(calls).toEqual(['decide:{"requestIds":["a"],"decision":"approve","notes":null}']);
  });

  it("saves a typed note before it acts, so the note is not lost", async () => {
    renderIt();
    const amount = screen.getAllByLabelText("Recommended amount for Deacons")[0];
    // Typed, and never left: no blur happens, as when the click lands first.
    fireEvent.change(amount, { target: { value: "350" } });
    fireEvent.click(screen.getByRole("button", { name: "Final approval (2)" }));
    fireEvent.click(await screen.findByRole("button", { name: "Give final approval" }));
    await vi.waitFor(() => expect(calls.some((c) => c.startsWith("decide:"))).toBe(true));

    expect(calls[0]).toContain("save:");
    expect(calls[0]).toContain('"recommendedAmount":350');
    expect(calls[calls.length - 1]).toContain("decide:");
  });

  it("will not send a batch back without saying why", async () => {
    renderIt();
    await userEvent.click(screen.getByRole("button", { name: /Send back to local leaders/ }));
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByRole("button", { name: "Send back" })).toBeDisabled();
    await userEvent.type(within(dialog).getByRole("textbox"), "Trim travel");
    expect(within(dialog).getByRole("button", { name: "Send back" })).toBeEnabled();
  });
});

describe("as the local leaders", () => {
  beforeEach(() => {
    role = "admin";
    requests = [
      req("a", "Deacons", "pending", 400),
      req("d", "Kids", "conditionally_approved", 321),
      req("e", "Youth", "board_review", 50),
    ];
  });

  it("lets a month be edited, and each row be approved or denied", () => {
    renderIt();
    // Each is on the table and on the phone card.
    expect(screen.getAllByRole("button", { name: /^Edit Jan for Deacons/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Approve Deacons for the Board" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Deny Deacons" }).length).toBeGreaterThan(0);
  });

  it("freezes a request that is with the Board", () => {
    renderIt();
    expect(screen.queryByRole("button", { name: /^Edit Jan for Youth/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Deny Youth" })).toBeNull();
  });

  it("sends only the ticked conditionally approved rows", async () => {
    renderIt();
    expect(screen.getByRole("button", { name: "Send for Board Review (0)" })).toBeDisabled();
    // A pending request cannot be sent, so it has no box.
    expect(screen.queryByRole("checkbox", { name: "Select Deacons" })).toBeNull();

    await userEvent.click(screen.getAllByRole("checkbox", { name: "Select Kids" })[0]);
    await userEvent.click(screen.getByRole("button", { name: "Send for Board Review (1)" }));
    await userEvent.click(screen.getByRole("button", { name: "Send for Board review" }));
    expect(calls).toEqual(['send:["d"]']);
  });
});
