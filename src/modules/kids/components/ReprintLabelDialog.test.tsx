// @vitest-environment jsdom

/**
 * Reprinting a lost slip: the parent slip always prints, and each child's tag
 * prints unless the volunteer unticks it.
 *
 * The code itself is the database's business (20260322340500 keeps it); what
 * this dialog decides is which rows reach the printer, and that is only
 * observable through the screen.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
// No global setup file in this repo, so the matchers are registered here.
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const findBatchForReprint = vi.fn();
const reprintLabel = vi.fn();

vi.mock("../services", () => ({
  kidsStationService: {
    findBatchForReprint: (...a: unknown[]) => findBatchForReprint(...a),
    reprintLabel: (...a: unknown[]) => reprintLabel(...a),
  },
}));

import { ReprintLabelDialog } from "./ReprintLabelDialog";

const row = (child_name: string, check_in_id: string, tag_number: number) => ({
  batch_id: "b7",
  pickup_code: "K3PT",
  pickup_token: "tok1",
  household_name: "Bekele",
  check_in_id,
  child_name,
  room_name: "Shine",
  tag_number,
  allergy_label: null,
  guardian_phone: null,
});

beforeEach(() => {
  findBatchForReprint.mockResolvedValue([
    {
      batch_id: "b7",
      household_name: "Bekele",
      masked_phone: "•••-1269",
      children: "Abel Bekele, Hana Bekele",
      checked_in_at: "2026-10-11T14:00:00Z",
    },
  ]);
  reprintLabel.mockResolvedValue([
    row("Abel Bekele", "c1", 11),
    row("Hana Bekele", "c2", 12),
  ]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function pickBekele() {
  const onReprinted = vi.fn();
  const user = userEvent.setup();
  render(
    <ReprintLabelDialog
      open
      onOpenChange={() => {}}
      sessionId="s1"
      onReprinted={onReprinted}
    />,
  );
  await user.type(screen.getByPlaceholderText(/name or phone/i), "Bek");
  await user.click(await screen.findByRole("button", { name: /bekele/i }));
  return { user, onReprinted };
}

describe("ReprintLabelDialog", () => {
  it("prints every child's tag unless told otherwise", async () => {
    const { user, onReprinted } = await pickBekele();
    expect(screen.getByRole("checkbox", { name: /abel bekele/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /hana bekele/i })).toBeChecked();

    await user.click(screen.getByRole("button", { name: /print a new slip/i }));

    await waitFor(() => expect(onReprinted).toHaveBeenCalledTimes(1));
    const [rows, tags] = onReprinted.mock.calls[0];
    expect(rows).toHaveLength(2);
    expect(tags).toHaveLength(2);
  });

  it("leaves out an unticked tag but keeps the child on the slip", async () => {
    const { user, onReprinted } = await pickBekele();
    await user.click(screen.getByRole("checkbox", { name: /hana bekele/i }));
    expect(screen.getByRole("checkbox", { name: /hana bekele/i })).not.toBeChecked();

    await user.click(screen.getByRole("button", { name: /print a new slip/i }));

    await waitFor(() => expect(onReprinted).toHaveBeenCalledTimes(1));
    const [rows, tags] = onReprinted.mock.calls[0];
    // The slip counts both: the code still collects Hana.
    expect(rows.map((r: { child_name: string }) => r.child_name)).toEqual([
      "Abel Bekele",
      "Hana Bekele",
    ]);
    expect(tags.map((r: { child_name: string }) => r.child_name)).toEqual(["Abel Bekele"]);
  });

  it("forgets the unticked tags when another family is picked", async () => {
    const { user } = await pickBekele();
    await user.click(screen.getByRole("checkbox", { name: /hana bekele/i }));
    // Deselect and pick again: a fresh family starts with every tag ticked.
    await user.click(screen.getByRole("button", { name: /bekele.*1269/i }));
    await user.click(screen.getByRole("button", { name: /bekele.*1269/i }));
    expect(screen.getByRole("checkbox", { name: /hana bekele/i })).toBeChecked();
  });
});
