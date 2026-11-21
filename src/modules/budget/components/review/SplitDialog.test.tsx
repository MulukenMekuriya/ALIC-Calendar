// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AllocationRequest } from "../../types";
import { SplitDialog } from "./SplitDialog";

afterEach(cleanup);

const line = (description: string, data: Record<string, number>) => ({
  category: "monthly_budget_item",
  description,
  amount: Object.values(data).reduce((a, b) => a + b, 0),
  monthly_data: { chart_of_accounts: "6000", ...data },
});

const request = {
  id: "r1",
  status: "pending",
  period_type: "monthly",
  requested_amount: 1200,
  approved_amount: null,
  budget_breakdown: [line("Venue", { jan: 500, feb: 500 }), line("Snacks", { mar: 200 })],
} as unknown as AllocationRequest;

describe("marking Green / Yellow / Red", () => {
  it("marks each line and month, needs a reason for Yellow, and sends every cell", async () => {
    const onSubmit = vi.fn(async () => {});
    render(<SplitDialog request={request} ministryName="Youth" busy={false} onClose={() => {}} onSubmit={onSubmit} />);

    // Starts all Green: one row per line-and-month with money in it.
    expect(screen.getAllByLabelText(/^Green for/)).toHaveLength(3);
    const approve = screen.getByRole("button", { name: "Approve for the Board" });
    expect(approve).toBeEnabled();

    // Feb of Venue: $200 Green, $300 Yellow.
    const green = screen.getByLabelText("Green for Venue Feb");
    const yellow = screen.getByLabelText("Yellow for Venue Feb");
    await userEvent.clear(green);
    await userEvent.type(green, "200");
    await userEvent.clear(yellow);
    await userEvent.type(yellow, "300");
    expect(approve).toBeDisabled();
    expect(screen.getByText("Required when any money is Yellow.")).toBeInTheDocument();

    // Snacks all Red, with an optional word on it.
    await userEvent.click(screen.getByRole("button", { name: "Make all of Snacks red" }));
    await userEvent.type(screen.getByLabelText(/Reason for Yellow/), "Depends on Q1 giving");
    await userEvent.type(screen.getByLabelText(/Reason for Red/), "Not needed this year");
    await userEvent.click(approve);

    expect(onSubmit).toHaveBeenCalledWith({
      cells: [
        { index: 0, month: "jan", green: 500, yellow: 0 },
        { index: 0, month: "feb", green: 200, yellow: 300 },
        { index: 1, month: "mar", green: 0, yellow: 0 },
      ],
      yellowReason: "Depends on Q1 giving",
      notes: "Not needed this year",
    });
  });

  it("refuses more than a cell holds", async () => {
    render(<SplitDialog request={request} ministryName="Youth" busy={false} onClose={() => {}} onSubmit={vi.fn()} />);
    const yellow = screen.getByLabelText("Yellow for Snacks Mar");
    await userEvent.clear(yellow);
    await userEvent.type(yellow, "50");
    expect(screen.getByText("More than $200.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve for the Board" })).toBeDisabled();
  });
});
