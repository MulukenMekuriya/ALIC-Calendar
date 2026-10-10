// @vitest-environment jsdom

/**
 * The directory and family tables, rendered with rows shaped like
 * church.directory_people and church.directory_families. The filtering and
 * sorting are tested in utils/directory; this checks what an admin relies on
 * here: the count, ticking people and setting their status with the right
 * ids, and the family tiles acting as filters.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const mutateAsync = vi.fn();
vi.mock("../hooks/useDirectory", () => ({
  useSetMembershipStatus: () => ({ mutateAsync, isPending: false }),
}));
vi.mock("../hooks/usePersonPhotos", () => ({
  usePersonPhotos: () => ({ data: undefined }),
  primaryPhotoUrl: () => null,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { DirectoryTable } from "./DirectoryTable";
import { FamiliesTable } from "./FamiliesTable";
import { NO_FILTERS, type DirectoryFamily, type DirectoryFilters, type DirectoryPerson } from "../utils/directory";
import type { MembershipStatus } from "../types";

// Radix Select measures and scrolls; jsdom does neither.
beforeEach(() => {
  mutateAsync.mockReset();
  mutateAsync.mockResolvedValue(2);
  Element.prototype.scrollIntoView ??= vi.fn();
  Element.prototype.hasPointerCapture ??= vi.fn(() => false);
  Element.prototype.releasePointerCapture ??= vi.fn();
});
afterEach(cleanup);

const person = (p: Partial<DirectoryPerson>): DirectoryPerson => ({
  id: p.first_name ?? "x",
  first_name: "Hana",
  last_name: "Bekele",
  preferred_name: null,
  is_child: false,
  is_active: true,
  email: null,
  phone: null,
  gender: null,
  birth_year: null,
  birth_month: null,
  membership_status_id: null,
  membership_code: null,
  membership_name: null,
  household_id: "h",
  household_name: "Bekele",
  grade_name: null,
  has_login: false,
  last_check_in: null,
  created_at: "2026-09-11T00:00:00Z",
  created_by_name: null,
  ...p,
});

const PEOPLE = [
  person({ first_name: "Abel", last_name: "Alemu" }),
  person({ first_name: "Bethel", last_name: "Bekele" }),
  person({ first_name: "Dawit", last_name: "Chala", membership_status_id: "s-member", membership_code: "member", membership_name: "Member" }),
];
const STATUSES = [
  { id: "s-member", code: "member", display_name: "Member" },
  { id: "s-visitor", code: "visitor", display_name: "Visitor" },
] as unknown as MembershipStatus[];

function renderDirectory(filters: DirectoryFilters = NO_FILTERS) {
  return render(
    <MemoryRouter>
      <DirectoryTable
        organizationId="org"
        people={PEOPLE}
        statuses={STATUSES}
        duplicates={new Set()}
        filters={filters}
        onFiltersChange={vi.fn()}
        canWrite
        isLoading={false}
      />
    </MemoryRouter>,
  );
}

describe("DirectoryTable", () => {
  it("counts who matches and shows each person's membership", () => {
    renderDirectory({ ...NO_FILTERS, attention: "no_status" });
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Abel Alemu")).toBeInTheDocument();
    expect(screen.queryByText("Dawit Chala")).not.toBeInTheDocument();
  });

  it("sets one status for everyone ticked, with their ids", async () => {
    const user = userEvent.setup();
    renderDirectory({ ...NO_FILTERS, attention: "no_status" });
    await user.click(screen.getByRole("checkbox", { name: "Select everyone on this page" }));
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Set membership status/ }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("combobox", { name: "New status" }));
    await user.click(screen.getByRole("option", { name: "Visitor" }));
    expect(within(dialog).getByText(/will change to Visitor/)).toHaveTextContent("2 will change to Visitor");
    await user.click(within(dialog).getByRole("button", { name: "Set 2 to Visitor" }));
    expect(mutateAsync).toHaveBeenCalledWith({ personIds: ["Abel", "Bethel"], statusId: "s-visitor" });
  });

  it("says when some ticked already have the status", async () => {
    const user = userEvent.setup();
    renderDirectory();
    await user.click(screen.getByRole("checkbox", { name: "Select everyone on this page" }));
    await user.click(screen.getByRole("button", { name: /Set membership status/ }));
    await user.click(within(screen.getByRole("dialog")).getByRole("combobox", { name: "New status" }));
    await user.click(screen.getByRole("option", { name: "Member" }));
    expect(screen.getByText(/1 already has it/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set 2 to Member" })).toBeEnabled();
  });
});

const family = (f: Partial<DirectoryFamily>): DirectoryFamily => ({
  household_id: f.name ?? "x",
  name: "Bekele",
  city: null,
  primary_contact_id: null,
  primary_contact_name: "Hana Bekele",
  primary_phone: "3015550101",
  primary_email: null,
  adult_count: 2,
  child_count: 0,
  family_status: "member",
  last_check_in: null,
  created_at: "2026-09-11T00:00:00Z",
  ...f,
});

describe("FamiliesTable", () => {
  const FAMILIES = [
    family({ name: "Alemu", child_count: 2, last_check_in: "2026-10-04" }),
    family({ name: "Bekele", family_status: "visitor", primary_phone: null }),
    family({ name: "Chala", family_status: "not_recorded" }),
  ];

  it("filters by a tile, and opens a family when its row is clicked", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<FamiliesTable families={FAMILIES} isLoading={false} onOpen={onOpen} />);
    expect(screen.getByText("Alemu")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /No phone number/ }));
    expect(screen.getByText("Bekele")).toBeInTheDocument();
    expect(screen.queryByText("Alemu")).not.toBeInTheDocument();

    await user.click(screen.getByText("Bekele"));
    expect(onOpen).toHaveBeenCalledWith("Bekele");
  });

  it("shows each family's status, and no status as such", () => {
    render(<FamiliesTable families={FAMILIES} isLoading={false} onOpen={vi.fn()} />);
    const row = (name: string) => screen.getByText(name).closest("tr")!;
    expect(within(row("Alemu")).getByText("Member")).toBeInTheDocument();
    expect(within(row("Bekele")).getByText("Visitor")).toBeInTheDocument();
    expect(within(row("Chala")).getByText("No status")).toBeInTheDocument();
  });
});
