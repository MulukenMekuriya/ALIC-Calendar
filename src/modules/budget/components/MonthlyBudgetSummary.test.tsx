// @vitest-environment jsdom
/**
 * The summary counts every submitted request, monthly or annual. It used to
 * keep only period_type === "monthly", so three ministries that filed annual
 * were missing from the 2027 figures the Leadership Council was reading.
 */
import { describe, it, expect, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MonthlyBudgetSummary } from "./MonthlyBudgetSummary";
import type { AllocationRequestWithRelations } from "../types";

const request = (
  id: string,
  ministry: string,
  period_type: "monthly" | "annual",
  requested_amount: number,
  status = "pending",
  months: Record<string, number> = {},
) =>
  ({
    id,
    ministry_id: `m-${ministry}`,
    ministry: { name: ministry },
    period_type,
    requested_amount,
    status,
    requester_name: "Someone",
    budget_breakdown:
      period_type === "monthly"
        ? [{ category: "monthly_budget_item", description: "x", amount: 0, monthly_data: months }]
        : [{ category: "Keyboard Player", description: "y", amount: requested_amount }],
  }) as unknown as AllocationRequestWithRelations;

afterEach(cleanup);

const rowOf = (name: string) => screen.getByText(name).closest("tr")!;

describe("MonthlyBudgetSummary", () => {
  it("counts annual requests, in an Annual column and in the totals", () => {
    render(
      <MonthlyBudgetSummary
        allocations={[
          request("1", "Men's", "monthly", 1500, "pending", { jan: 500, feb: 1000 }),
          request("2", "Ha Choir", "annual", 6820),
          request("3", "Deacons", "annual", 400),
          request("4", "Deacons", "annual", 11000),
        ]}
      />,
    );

    expect(screen.getByText("3 Ministries")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Annual" })).toBeInTheDocument();

    const deacons = within(rowOf("Deacons"));
    expect(deacons.getByText("2 requests")).toBeInTheDocument();
    expect(deacons.getAllByText("$11,400")).toHaveLength(2); // Annual and Total

    expect(within(rowOf("Men's")).getAllByText("$1,500")).toHaveLength(1);
    // 1,500 + 6,820 + 11,400
    expect(screen.getAllByText("$19,720").length).toBeGreaterThan(0);
  });

  it("leaves cancelled requests out", () => {
    render(
      <MonthlyBudgetSummary
        allocations={[
          request("1", "Prayer", "monthly", 3000, "pending", { aug: 3000 }),
          request("2", "Teaching", "annual", 40000, "cancelled"),
        ]}
      />,
    );

    expect(screen.getByText("1 Ministry")).toBeInTheDocument();
    expect(screen.queryByText("Teaching")).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "Annual" })).toBeNull();
  });
});
