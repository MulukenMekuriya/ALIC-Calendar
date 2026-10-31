// @vitest-environment jsdom

/**
 * Editing an existing MONTHLY request.
 *
 * The edit step never loaded the saved lines or the ministry, so opening a
 * monthly request showed no lines and Save refused ("total must be greater
 * than 0"); and the saved lines were also left in the generic breakdown, so a
 * save would have stored every line twice. These open the real form on a
 * saved request and press Save.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AllocationRequest } from "../types";

const updateMutate = vi.fn().mockResolvedValue({});
const councilMutate = vi.fn().mockResolvedValue({});
const toast = vi.fn();
let isAdmin = false;
let userId = "u-requester";

vi.mock("@/shared/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/shared/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: userId }, isAdmin }),
}));
vi.mock("@/shared/contexts/OrganizationContext", () => ({
  useOrganization: () => ({ currentOrganization: { id: "org-md", name: "ALIC MD" } }),
}));
vi.mock("@/hooks/useUserProfile", () => ({
  useUserProfile: () => ({ profile: { full_name: "Elias Adera", ministry_name: null } }),
}));

const FY = { id: "fy-2027", year: 2027, name: "2027", is_active: false };

vi.mock("../hooks", () => ({
  useMinistries: () => ({
    data: [{ id: "m-visiting", name: "ALIC Visiting" }],
    isLoading: false,
  }),
  useFiscalYears: () => ({ data: [FY], isLoading: false }),
  useActiveFiscalYear: () => ({ data: FY }),
  useRequestSeason: () => ({ data: undefined }),
  useCreateAllocationRequest: () => ({ mutateAsync: vi.fn() }),
  useUpdateAllocationRequest: () => ({ mutateAsync: updateMutate }),
  useSubmitAllocationRequest: () => ({ mutateAsync: vi.fn() }),
  useCouncilDecision: () => ({ mutateAsync: councilMutate }),
}));

import { AllocationRequestForm } from "./AllocationRequestForm";

const monthlyRequest = (over: Partial<AllocationRequest> = {}) =>
  ({
    id: "req-1",
    organization_id: "org-md",
    fiscal_year_id: "fy-2027",
    ministry_id: "m-visiting",
    ministry: { name: "ALIC Visiting" },
    requester_id: "u-requester",
    requester_name: "Elias Adera",
    period_type: "monthly",
    requested_amount: 3000,
    justification: "Visiting members meeting: $2,000; A thing nobody listed: $1,000",
    status: "draft",
    budget_breakdown: [
      {
        category: "monthly_budget_item",
        description: "Visiting members meeting",
        amount: 2000,
        monthly_data: { chart_of_accounts: "5100", description: "Quarterly", apr: 1000, nov: 1000 },
      },
      {
        category: "monthly_budget_item",
        description: "A thing nobody listed",
        amount: 1000,
        monthly_data: { jan: 600, feb: 400 },
      },
    ],
    ...over,
  }) as unknown as AllocationRequest;

const open = (request: AllocationRequest) =>
  render(<AllocationRequestForm open onOpenChange={() => {}} request={request} />);

beforeEach(() => {
  updateMutate.mockClear();
  councilMutate.mockClear();
  toast.mockClear();
  isAdmin = false;
  userId = "u-requester";
});

afterEach(cleanup);

describe("AllocationRequestForm, editing a monthly request", () => {
  it("opens with the saved lines in their fields", async () => {
    open(monthlyRequest());

    // One justification box per line.
    await waitFor(() =>
      expect(screen.getAllByPlaceholderText("e.g. 53130")).toHaveLength(2),
    );
    expect(screen.getByDisplayValue("5100")).toBeInTheDocument();
    expect(screen.getByDisplayValue("A thing nobody listed")).toBeInTheDocument();
  });

  it("saves the same total and the same two lines, not none and not four", async () => {
    open(monthlyRequest());
    await waitFor(() => expect(screen.getAllByPlaceholderText("e.g. 53130")).toHaveLength(2));

    await userEvent.click(screen.getByRole("button", { name: /Save Draft/i }));

    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1));
    const { requestId, data } = updateMutate.mock.calls[0][0];

    expect(requestId).toBe("req-1");
    expect(data.requested_amount).toBe(3000);
    expect(data.budget_breakdown).toHaveLength(2);
    expect(data.budget_breakdown.map((i: { description: string }) => i.description)).toEqual([
      "Visiting members meeting",
      "A thing nobody listed",
    ]);
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
  });

  it("lets an admin save another ministry's request without picking the ministry again", async () => {
    isAdmin = true;
    userId = "u-admin";
    open(monthlyRequest({ status: "pending" } as Partial<AllocationRequest>));
    await waitFor(() => expect(screen.getAllByPlaceholderText("e.g. 53130")).toHaveLength(2));

    await userEvent.click(screen.getByRole("button", { name: /Save Changes/i }));

    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1));
    expect(toast).not.toHaveBeenCalledWith(
      expect.objectContaining({ description: expect.stringMatching(/ministry/i) }),
    );
    // And the admin's first edit starts the review, as before.
    expect(councilMutate).toHaveBeenCalledWith({ requestId: "req-1", decision: "review" });
  });
});

describe("AllocationRequestForm, the period choice", () => {
  const period = (name: string) => screen.getByRole("button", { name });

  it("starts a new request as monthly, with annual and quarterly switched off", async () => {
    render(<AllocationRequestForm open onOpenChange={() => {}} />);

    await waitFor(() => expect(period("Monthly")).toBeInTheDocument());
    expect(period("Annual")).toBeDisabled();
    expect(period("Quarterly")).toBeDisabled();
    expect(period("Monthly")).toBeEnabled();
    expect(screen.getAllByPlaceholderText("e.g. 53130")).toHaveLength(1);
  });

  it("still lets a request already filed as annual be opened and changed", async () => {
    open(
      monthlyRequest({
        period_type: "annual",
        budget_breakdown: [],
        requested_amount: 4000,
      } as Partial<AllocationRequest>),
    );

    await waitFor(() => expect(period("Annual")).toBeEnabled());
    expect(period("Monthly")).toBeEnabled();
    expect(period("Quarterly")).toBeDisabled();
  });
});
