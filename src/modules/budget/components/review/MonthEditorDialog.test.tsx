// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AllocationRequestWithRelations } from "../../types";

const mutateAsync = vi.fn(async () => ({}));
vi.mock("../../hooks/useBoardReview", () => ({ useEditRequestMonth: () => ({ mutateAsync, isPending: false }) }));
vi.mock("@/shared/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { MonthEditorDialog } from "./MonthEditorDialog";
import { buildReviewRow } from "../../utils/reviewMatrix";

const line = (description: string, data: Record<string, number>) => ({
  category: "monthly_budget_item",
  description,
  amount: 0,
  monthly_data: { chart_of_accounts: "6000", ...data },
});

const row = buildReviewRow({
  id: "r",
  organization_id: "md",
  ministry_id: "m",
  ministry: { name: "Counseling" },
  period_type: "monthly",
  status: "pending",
  updated_at: "2026-01-01T00:00:00Z",
  requested_amount: 0,
  budget_breakdown: [line("Couples", { sep: 1200 }), line("Singles", { jan: 1750 }), line("Retreat", { sep: 300, jan: 5 })],
} as unknown as AllocationRequestWithRelations);

afterEach(() => {
  cleanup();
  mutateAsync.mockClear();
});

describe("MonthEditorDialog", () => {
  it("offers only the lines that have something in the clicked month", () => {
    render(<MonthEditorDialog row={row} monthIndex={8} onClose={() => {}} />);
    expect(screen.getByText("Couples")).toBeInTheDocument();
    expect(screen.getByText("Retreat")).toBeInTheDocument();
    expect(screen.queryByText("Singles")).toBeNull();
  });

  it("sends only those lines, by position, when saved", async () => {
    render(<MonthEditorDialog row={row} monthIndex={8} onClose={() => {}} />);
    const input = screen.getByLabelText(/Couples/);
    await userEvent.clear(input);
    await userEvent.type(input, "1000");
    await userEvent.click(screen.getByRole("button", { name: "Save month" }));
    expect(mutateAsync).toHaveBeenCalledWith({
      requestId: "r",
      month: "sep",
      amounts: [
        { index: 0, amount: 1000 },
        { index: 2, amount: 300 },
      ],
      expectedUpdatedAt: "2026-01-01T00:00:00Z",
    });
  });

  it("offers every line when the month is empty, so an amount can be put on one", () => {
    render(<MonthEditorDialog row={row} monthIndex={3} onClose={() => {}} />);
    expect(screen.getByText("Singles")).toBeInTheDocument();
    expect(screen.getByText("Couples")).toBeInTheDocument();
  });

  it("will not save a negative amount", async () => {
    render(<MonthEditorDialog row={row} monthIndex={8} onClose={() => {}} />);
    const input = screen.getByLabelText(/Couples/);
    await userEvent.clear(input);
    await userEvent.type(input, "-5");
    expect(screen.getByRole("button", { name: "Save month" })).toBeDisabled();
  });
});
