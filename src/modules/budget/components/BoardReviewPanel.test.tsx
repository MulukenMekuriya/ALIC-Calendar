// @vitest-environment jsdom

/**
 * What the Board Review screen shows, and to whom.
 *
 * Three of these guard things that are invisible to a test of the data layer
 * and were wrong when this screen was first written:
 *
 *   - the Board must not be offered Approve. The policies refuse it, but a
 *     button that errors is a promise the screen had no business making;
 *   - a request nobody has put a figure on must not read as zero;
 *   - a failed feedback query must not read as "the Board said nothing".
 *
 * The fourth is the feedback box itself. It lived inside the panel component,
 * so every keystroke remounted it and took the cursor out of the field — a
 * defect that a render-once test cannot see, which is why the typing test
 * below types more than one character.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AllocationBoardFeedback, AllocationRequestWithRelations } from "../types";

const MD = "a0eebc99-0000-0000-0000-00000000md";
const VA = "b1eebc99-0000-0000-0000-00000000va";

// --- what the hooks answer with, per test ---------------------------------
let requests: AllocationRequestWithRelations[] = [];
let feedback: AllocationBoardFeedback[] = [];
let feedbackError: Error | null = null;
let roles = { isAdmin: false, isBoard: false };
let branches = [
  { organization_id: MD, organization: { name: "ALIC MD - Silver Spring" } },
  { organization_id: VA, organization: { name: "ALIC VA - Springfield" } },
];

const saveFeedback = vi.fn().mockResolvedValue({});
const moveToBoardReview = vi.fn().mockResolvedValue([{ id: "r1" }]);

vi.mock("@/shared/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "me" }, ...roles }),
}));

vi.mock("@/shared/contexts/OrganizationContext", () => ({
  useOrganization: () => ({ userOrganizations: branches }),
}));

vi.mock("@/hooks/useUserProfile", () => ({
  useUserProfile: () => ({ profile: { full_name: "A Board Member" } }),
}));

vi.mock("../hooks", () => ({
  useAllocationRequestsAcrossBranches: () => ({
    data: requests,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useBoardFeedback: () => ({
    data: feedback,
    isLoading: false,
    error: feedbackError,
  }),
  useMoveToBoardReview: () => ({
    mutateAsync: moveToBoardReview,
    isPending: false,
  }),
  useSaveBoardFeedback: () => ({ mutateAsync: saveFeedback }),
}));

// The dialogs pull in the whole allocation form; none of this is under test.
vi.mock("./AllocationRequestForm", () => ({ AllocationRequestForm: () => null }));
vi.mock("./AllocationRequestDetailDialog", () => ({
  AllocationRequestDetailDialog: () => null,
}));
vi.mock("./AllocationReviewDialog", () => ({ AllocationReviewDialog: () => null }));

const toast = vi.fn();
vi.mock("@/shared/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

import { BoardReviewPanel } from "./BoardReviewPanel";

/**
 * Both layouts are in the DOM at once — the responsive ones are hidden with
 * CSS, which jsdom does not apply — so every query is scoped to the desktop
 * table of the branch it belongs to, or it matches twice.
 */
const mdSheet = () => within(screen.getAllByRole("table")[0]);
const tile = (label: string) =>
  within(screen.getByRole("group", { name: label }));

const aRequest = (
  id: string,
  ministry: string,
  amount: number,
  status: string,
  organizationId = MD,
) =>
  ({
    id,
    organization_id: organizationId,
    ministry_id: `m-${id}`,
    ministry: { id: `m-${id}`, name: ministry },
    requested_amount: amount,
    approved_amount: null,
    status,
    requester_name: "Elias Adera",
    justification: `${ministry} needs this`,
  }) as unknown as AllocationRequestWithRelations;

const aNote = (
  requestId: string,
  memberId: string,
  amount: number | null,
  comment: string | null = null,
) =>
  ({
    id: `${requestId}-${memberId}`,
    request_id: requestId,
    organization_id: MD,
    board_member_id: memberId,
    board_member_name: memberId === "me" ? "A Board Member" : "Another Member",
    recommended_amount: amount,
    comment,
  }) as unknown as AllocationBoardFeedback;

beforeEach(() => {
  requests = [
    aRequest("youth", "Youth", 10000, "board_review"),
    aRequest("prayer", "Prayer", 2000, "pending"),
    aRequest("worship", "Worship", 4000, "board_review", VA),
  ];
  feedback = [];
  feedbackError = null;
  roles = { isAdmin: false, isBoard: false };
  branches = [
    { organization_id: MD, organization: { name: "ALIC MD - Silver Spring" } },
    { organization_id: VA, organization: { name: "ALIC VA - Springfield" } },
  ];
  toast.mockClear();
  saveFeedback.mockClear();
  moveToBoardReview.mockClear();
});

afterEach(cleanup);

describe("Board Review, what is on the screen", () => {
  it("shows both branches and totals the whole church", () => {
    render(<BoardReviewPanel year={2027} />);

    expect(screen.getByText("ALIC MD - Silver Spring")).toBeInTheDocument();
    expect(screen.getByText("ALIC VA - Springfield")).toBeInTheDocument();
    // 10000 + 2000 + 4000, across two branches.
    expect(tile("Requested").getByText("$16,000")).toBeInTheDocument();
  });

  it("puts the biggest ask at the top", () => {
    render(<BoardReviewPanel year={2027} />);

    const mdRows = mdSheet().getAllByRole("button", { name: /expand details/i });
    expect(mdRows[0]).toHaveTextContent("Youth");
    expect(mdRows[1]).toHaveTextContent("Prayer");
  });

  it("says a request has no recommendation rather than showing zero", () => {
    render(<BoardReviewPanel year={2027} />);

    const youth = mdSheet().getByRole("button", { name: /Youth/i });
    expect(within(youth).getByText("—")).toBeInTheDocument();
  });

  it("shows the spread when board members disagree", () => {
    feedback = [aNote("youth", "me", 8000), aNote("youth", "other", 6000)];
    render(<BoardReviewPanel year={2027} />);

    expect(mdSheet().getByText("$7,000")).toBeInTheDocument();
    expect(mdSheet().getByText(/\$6,000.*\$8,000/)).toBeInTheDocument();
  });

  it("says so when the Board's feedback could not be loaded", () => {
    feedbackError = new Error("relation does not exist");
    render(<BoardReviewPanel year={2027} />);

    expect(
      screen.getByText(/feedback could not be loaded/i),
    ).toBeInTheDocument();
  });
});

describe("Board Review, who may do what", () => {
  it("does not offer the Board an Approve button", async () => {
    roles = { isAdmin: false, isBoard: true };
    render(<BoardReviewPanel year={2027} />);

    await userEvent.click(mdSheet().getByRole("button", { name: /Youth/i }));

    expect(mdSheet().queryByRole("button", { name: /^Approve$/ })).toBeNull();
    expect(mdSheet().queryByRole("button", { name: /Send to the Board/i })).toBeNull();
    expect(mdSheet().getByRole("button", { name: /Record my feedback/i })).toBeInTheDocument();
  });

  it("offers the office the whole workflow and no feedback box", async () => {
    roles = { isAdmin: true, isBoard: false };
    render(<BoardReviewPanel year={2027} />);

    await userEvent.click(mdSheet().getByRole("button", { name: /Youth/i }));

    expect(mdSheet().getByRole("button", { name: /^Approve$/ })).toBeInTheDocument();
    expect(mdSheet().getByRole("button", { name: /Return to the office/i })).toBeInTheDocument();
    expect(mdSheet().queryByRole("button", { name: /Record my feedback/i })).toBeNull();
  });

  it("offers the office one button for every request still at its desk", () => {
    roles = { isAdmin: true, isBoard: false };
    render(<BoardReviewPanel year={2027} />);

    // One request is 'pending'; the other two are already with the Board.
    expect(screen.getByRole("button", { name: /Send 1 to the Board/i })).toBeInTheDocument();
  });

  it("shows a reader neither the workflow nor the feedback box", async () => {
    render(<BoardReviewPanel year={2027} />);

    await userEvent.click(mdSheet().getByRole("button", { name: /Youth/i }));

    expect(mdSheet().queryByRole("button", { name: /^Approve$/ })).toBeNull();
    expect(mdSheet().queryByRole("button", { name: /Record my feedback/i })).toBeNull();
    expect(mdSheet().getByRole("button", { name: /Full breakdown/i })).toBeInTheDocument();
  });
});

describe("Board Review, leaving feedback", () => {
  beforeEach(() => {
    roles = { isAdmin: false, isBoard: true };
  });

  it("keeps the cursor in the box while a whole sentence is typed", async () => {
    // The defect this guards: RowDetail was defined inside the panel, so each
    // keystroke gave React a new component type, remounted the subtree and
    // dropped focus. One character would go in and the rest would be lost.
    render(<BoardReviewPanel year={2027} />);
    await userEvent.click(mdSheet().getByRole("button", { name: /Youth/i }));

    const comment = mdSheet().getByLabelText(/Comment/i);
    await userEvent.type(comment, "Ask them to re-plan the retreat");

    expect(comment).toHaveValue("Ask them to re-plan the retreat");
    expect(comment).toHaveFocus();
  });

  it("marks a draft as unsaved until it is recorded", async () => {
    render(<BoardReviewPanel year={2027} />);
    await userEvent.click(mdSheet().getByRole("button", { name: /Youth/i }));

    expect(mdSheet().queryByText("Unsaved")).toBeNull();
    await userEvent.type(mdSheet().getByLabelText(/Comment/i), "Too much");
    expect(mdSheet().getByText("Unsaved")).toBeInTheDocument();
  });

  it("records a figure and a comment against the right request", async () => {
    render(<BoardReviewPanel year={2027} />);
    await userEvent.click(mdSheet().getByRole("button", { name: /Youth/i }));

    await userEvent.type(mdSheet().getByLabelText(/Recommended amount/i), "8000");
    await userEvent.type(mdSheet().getByLabelText(/Comment/i), "Trim the retreat");
    await userEvent.click(mdSheet().getByRole("button", { name: /Record my feedback/i }));

    expect(saveFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "youth",
        organizationId: MD,
        recommendedAmount: 8000,
        comment: "Trim the retreat",
      }),
    );
  });

  it("lets a board member comment without inventing a figure", async () => {
    render(<BoardReviewPanel year={2027} />);
    await userEvent.click(mdSheet().getByRole("button", { name: /Youth/i }));

    await userEvent.type(mdSheet().getByLabelText(/Comment/i), "Fine as it stands");
    await userEvent.click(mdSheet().getByRole("button", { name: /Record my feedback/i }));

    expect(saveFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ recommendedAmount: null }),
    );
  });

  it("refuses an empty note instead of handing back a constraint name", async () => {
    render(<BoardReviewPanel year={2027} />);
    await userEvent.click(mdSheet().getByRole("button", { name: /Youth/i }));

    await userEvent.click(mdSheet().getByRole("button", { name: /Record my feedback/i }));

    expect(saveFeedback).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Nothing to record" }),
    );
  });

  it("refuses a figure that is not a number", async () => {
    render(<BoardReviewPanel year={2027} />);
    await userEvent.click(mdSheet().getByRole("button", { name: /Youth/i }));

    await userEvent.type(mdSheet().getByLabelText(/Recommended amount/i), "a lot");
    await userEvent.click(mdSheet().getByRole("button", { name: /Record my feedback/i }));

    expect(saveFeedback).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "That is not an amount" }),
    );
  });

  it("puts a board member's own note back in the boxes to be revised", async () => {
    feedback = [aNote("youth", "me", 8000, "Trim the retreat")];
    render(<BoardReviewPanel year={2027} />);
    await userEvent.click(mdSheet().getByRole("button", { name: /Youth/i }));

    expect(mdSheet().getByLabelText(/Recommended amount/i)).toHaveValue("8000");
    expect(mdSheet().getByLabelText(/Comment/i)).toHaveValue("Trim the retreat");
    expect(
      mdSheet().getByRole("button", { name: /Update my feedback/i }),
    ).toBeInTheDocument();
  });
});

describe("Board Review, reachable without a mouse", () => {
  it("opens a row from the keyboard", async () => {
    roles = { isAdmin: false, isBoard: true };
    render(<BoardReviewPanel year={2027} />);

    const row = mdSheet().getByRole("button", { name: /Youth/i });
    row.focus();
    await userEvent.keyboard("{Enter}");

    expect(row).toHaveAttribute("aria-expanded", "true");
    expect(mdSheet().getByLabelText(/Comment/i)).toBeInTheDocument();
  });

  it("announces which column the sheet is sorted by", async () => {
    render(<BoardReviewPanel year={2027} />);

    const requested = screen.getAllByRole("columnheader", { name: /Requested$/i })[0];
    expect(requested).toHaveAttribute("aria-sort", "descending");

    await userEvent.click(within(requested).getByRole("button"));
    expect(requested).toHaveAttribute("aria-sort", "ascending");
  });

  it("re-sorts when another column is chosen", async () => {
    render(<BoardReviewPanel year={2027} />);

    const ministry = screen.getAllByRole("columnheader", { name: /Ministry/i })[0];
    await userEvent.click(within(ministry).getByRole("button"));

    expect(ministry).toHaveAttribute("aria-sort", "ascending");
    const rows = mdSheet().getAllByRole("button", { name: /expand details/i });
    expect(rows[0]).toHaveTextContent("Prayer");
  });
});
