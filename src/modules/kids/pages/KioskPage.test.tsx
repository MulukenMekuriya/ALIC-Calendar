// @vitest-environment jsdom

/**
 * A parent picks the classroom, on the screen, with nobody standing behind it.
 *
 * WHY THESE ARE COMPONENT TESTS AND NOT UNIT TESTS. There is no function here
 * to test: the whole of this feature is which room id ends up in which slot of
 * the array sent to check_in_children, and what the parent is told when the
 * database refuses it. Both are only observable through the screen. The kiosk
 * has shipped two bugs of exactly this shape already — `!result.ok` against a
 * result whose field is `submitted`, which told every parent the printer had
 * failed, and a parent label printed with no service name on it — and both
 * passed a typecheck.
 *
 * THE ONE ASSERTION THAT MATTERS MOST is the first: a family who touches
 * nothing must still send an array of nulls. That is what keeps this change
 * confined to the families who choose, and it is what stops a morning's
 * children piling into whichever room was emptiest when the kiosk booted.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
// No global setup file in this repo, so the matchers are registered here.
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const bootstrap = vi.fn();
const findByPhone = vi.fn();
const sessionRooms = vi.fn();
const checkIn = vi.fn();
const printLabels = vi.fn();

vi.mock("../services/kioskService", () => ({
  kioskService: {
    bootstrap: (...a: unknown[]) => bootstrap(...a),
    findByPhone: (...a: unknown[]) => findByPhone(...a),
    sessionRooms: (...a: unknown[]) => sessionRooms(...a),
  },
}));

vi.mock("../services/kidsStationService", () => ({
  kidsStationService: { checkIn: (...a: unknown[]) => checkIn(...a) },
}));

vi.mock("../services/labelPrintService", () => ({
  printLabels: (...a: unknown[]) => printLabels(...a),
  renderQrSvg: () => Promise.resolve("<svg/>"),
}));

vi.mock("@/shared/constants/branding", () => ({ getLogoSrc: () => "/logo.png" }));

import KioskPage from "./KioskPage";

const SESSION = "11111111-1111-1111-1111-111111111111";
const ABEL = "aaaaaaaa-0000-0000-0000-000000000001";
const SARA = "aaaaaaaa-0000-0000-0000-000000000002";

const JOY = "22222222-0000-0000-0000-000000000001";
const SHINE = "22222222-0000-0000-0000-000000000002";
const REDEEMED = "22222222-0000-0000-0000-000000000003";

beforeEach(() => {
  vi.clearAllMocks();

  bootstrap.mockResolvedValue({
    kids_session_id: SESSION,
    session_label: "Second Service",
    session_date: "2026-09-27",
    status: "open",
    station_name: "Lobby tablet",
    station_known: true,
    open_room_count: 3,
  });

  // Two siblings in two different classrooms, which is the ordinary case and
  // the reason a parent reaches for this screen at all.
  findByPhone.mockResolvedValue([
    {
      household_id: "h1",
      household_name: "Bekele",
      child_person_id: ABEL,
      child_name: "Abel Bekele",
      photo_path: null,
      grade_name: "Grade 4",
      already_checked_in: false,
      suggested_room_id: SHINE,
      suggested_room_name: "Shine 4th Grade",
    },
    {
      household_id: "h1",
      household_name: "Bekele",
      child_person_id: SARA,
      child_name: "Sara Bekele",
      photo_path: null,
      grade_name: "Grade 1",
      already_checked_in: false,
      suggested_room_id: JOY,
      suggested_room_name: "Joy 1st Grade",
    },
  ]);

  sessionRooms.mockResolvedValue([
    { room_id: JOY, room_name: "Joy 1st Grade", grade_name: "Grade 1", is_full: false },
    { room_id: SHINE, room_name: "Shine 4th Grade", grade_name: "Grade 4", is_full: false },
    { room_id: REDEEMED, room_name: "Redeemed 6th Grade", grade_name: "Grade 6", is_full: true },
  ]);

  checkIn.mockResolvedValue([
    {
      batch_id: "b1",
      pickup_code: "K4T9",
      pickup_token: "tok",
      check_in_id: "c1",
      child_person_id: ABEL,
      child_name: "Abel Bekele",
      room_id: SHINE,
      room_name: "Shine 4th Grade",
      tag_number: 11,
      allergy_label: null,
      has_restriction: false,
      refused: false,
    },
    {
      batch_id: "b1",
      pickup_code: "K4T9",
      pickup_token: "tok",
      check_in_id: "c2",
      child_person_id: SARA,
      child_name: "Sara Bekele",
      room_id: JOY,
      room_name: "Joy 1st Grade",
      tag_number: 12,
      allergy_label: null,
      has_restriction: false,
      refused: false,
    },
  ]);

  printLabels.mockResolvedValue({ submitted: true });
});

afterEach(cleanup);

/** Through the idle screen, the keypad and the search, to the children. */
const reachChildren = async (user: ReturnType<typeof userEvent.setup>) => {
  render(<KioskPage />);
  await user.click(await screen.findByRole("button", { name: /start/i }));
  for (const d of "3015550147") {
    await user.click(screen.getByRole("button", { name: d }));
  }
  await user.click(screen.getByRole("button", { name: /find my children/i }));
  await screen.findByRole("heading", { name: /who is here this morning/i });
};

const roomIdsFromLastCheckIn = () => {
  const call = checkIn.mock.calls.at(-1)?.[0] as {
    childIds: string[];
    roomIds: (string | null)[];
  };
  return Object.fromEntries(call.childIds.map((id, i) => [id, call.roomIds[i]]));
};

describe("the kiosk classroom picker", () => {
  it("sends NO room ids when the parent touches nothing", async () => {
    const user = userEvent.setup();
    await reachChildren(user);

    // The suggestion is the selected option before anything is committed, so a
    // parent can read where their child is going and simply not touch it.
    const [abel, sara] = screen.getAllByRole("combobox");
    expect(abel).toHaveDisplayValue("Shine 4th Grade (usual)");
    expect(sara).toHaveDisplayValue("Joy 1st Grade (usual)");

    await user.click(screen.getByRole("button", { name: /check in 2 children/i }));
    await screen.findByRole("heading", { name: /all done/i });

    expect(roomIdsFromLastCheckIn()).toEqual({ [ABEL]: null, [SARA]: null });
  });

  it("sends the chosen classroom, for that child and no other", async () => {
    const user = userEvent.setup();
    await reachChildren(user);

    // Abel's tile is the first, so his dropdown is the first.
    const [abel, sara] = screen.getAllByRole("combobox");
    await user.selectOptions(abel, JOY);

    expect(abel).toHaveDisplayValue("Joy 1st Grade");
    // Sara's is untouched and still showing her own default.
    expect(sara).toHaveDisplayValue("Joy 1st Grade (usual)");

    await user.click(screen.getByRole("button", { name: /check in 2 children/i }));
    await screen.findByRole("heading", { name: /all done/i });

    // POSITIONAL, and only Abel moved. A sibling picking up the other's room is
    // the silent failure this whole array is capable of.
    expect(roomIdsFromLastCheckIn()).toEqual({ [ABEL]: JOY, [SARA]: null });
  });

  it("will not let a parent choose a full classroom", async () => {
    const user = userEvent.setup();
    await reachChildren(user);

    const full = screen.getAllByRole("option", { name: /redeemed 6th grade/i })[0];
    expect(full).toBeDisabled();
    // In words, not only greyed out: a disabled option carries no other signal.
    expect(full).toHaveTextContent(/full/i);

    // And selecting it does nothing — the dropdown keeps the child's own
    // classroom rather than quietly accepting a room that will refuse the
    // whole family at the last moment.
    const [abel] = screen.getAllByRole("combobox");
    await user.selectOptions(abel, REDEEMED);
    expect(abel).toHaveDisplayValue("Shine 4th Grade (usual)");
  });

  it("lets a parent undo a choice back to the usual classroom", async () => {
    const user = userEvent.setup();
    await reachChildren(user);

    const [abel] = screen.getAllByRole("combobox");
    await user.selectOptions(abel, JOY);
    // Back to the first option, which is the undo: "" sends a null again.
    await user.selectOptions(abel, "");
    expect(abel).toHaveDisplayValue("Shine 4th Grade (usual)");

    await user.click(screen.getByRole("button", { name: /check in 2 children/i }));
    await screen.findByRole("heading", { name: /all done/i });

    expect(roomIdsFromLastCheckIn()).toEqual({ [ABEL]: null, [SARA]: null });
  });

  it("explains a full classroom instead of printing the database's word for it", async () => {
    const user = userEvent.setup();
    await reachChildren(user);
    const [abel] = screen.getAllByRole("combobox");
    await user.selectOptions(abel, JOY);

    // check_in_one_child RAISES on a full room, which rolls the whole batch
    // back — so this is an exception, not a refused row.
    checkIn.mockRejectedValueOnce(new Error("room_at_capacity"));
    await user.click(screen.getByRole("button", { name: /check in 2 children/i }));

    // The paragraph on the screen, not the live region, which announces the
    // same words to a screen reader — both is the component doing its job.
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/that classroom is full now/i),
    );
    expect(screen.queryByText(/room_at_capacity/)).not.toBeInTheDocument();

    // AND THE FAMILY IS STILL THERE, with the choice they made, because nothing
    // was written. The next tap is a different classroom, not a fresh start.
    expect(
      screen.getByRole("heading", { name: /who is here this morning/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("combobox")[0]).toHaveDisplayValue("Joy 1st Grade");

    // Nothing printed for a batch that does not exist.
    expect(printLabels).not.toHaveBeenCalled();
  });

  it("names the classroom each child went to on the last screen", async () => {
    const user = userEvent.setup();
    await reachChildren(user);
    await user.click(screen.getByRole("button", { name: /check in 2 children/i }));

    await screen.findByRole("heading", { name: /all done/i });
    expect(screen.getByText("K4T9")).toBeInTheDocument();
    // From the rows the database returned, so the screen and the printed label
    // cannot disagree about where a child is.
    expect(screen.getByText(/take them to/i)).toBeInTheDocument();
    // The li, not the name inside it: the classroom is a sibling text node.
    expect(screen.getByText("Abel Bekele").closest("li")).toHaveTextContent(
      "Shine 4th Grade",
    );
    expect(screen.getByText("Sara Bekele").closest("li")).toHaveTextContent(
      "Joy 1st Grade",
    );
  });

  it("hides the chooser entirely when no classroom list came back", async () => {
    sessionRooms.mockResolvedValue([]);
    const user = userEvent.setup();
    await reachChildren(user);

    // The screen falls back to exactly what it did before it could choose,
    // rather than offering an empty dropdown.
    await waitFor(() =>
      expect(screen.queryByRole("combobox")).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: /check in 2 children/i }));
    await screen.findByRole("heading", { name: /all done/i });
    expect(roomIdsFromLastCheckIn()).toEqual({ [ABEL]: null, [SARA]: null });
  });
});
