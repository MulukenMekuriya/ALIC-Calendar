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
 *
 * THE SECOND GROUP is the welcome screen's two secondary actions, which are
 * the desk's own dialogs. The dialogs are stood in for: what they do inside is
 * theirs and tested nowhere near here; what the kiosk does with what they hand
 * back — a registered family, a reprinted code — is what these check.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
// No global setup file in this repo, so the matchers are registered here.
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
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

// Stand-ins for the desk's dialogs. Ids are literals here because vi.mock is
// hoisted above every const in this file.
vi.mock("../components/VisitorFamilyDialog", () => ({
  VisitorFamilyDialog: (p: {
    open: boolean;
    initialQuery?: string;
    onOpenChange: (open: boolean) => void;
    onRegistered: (rows: unknown[]) => void;
  }) =>
    p.open ? (
      <div role="dialog" aria-label="Visiting family">
        <span data-testid="visitor-initial-query">{p.initialQuery ?? ""}</span>
        <button
          type="button"
          onClick={() =>
            p.onRegistered([
              {
                household_id: "h9",
                household_name: "Tesfaye",
                guardian_person_id: "g9",
                child_person_id: "bbbbbbbb-0000-0000-0000-000000000001",
                child_display_name: "Lydia T.",
              },
              {
                household_id: "h9",
                household_name: "Tesfaye",
                guardian_person_id: "g9",
                child_person_id: "bbbbbbbb-0000-0000-0000-000000000002",
                child_display_name: "Noah T.",
              },
            ])
          }
        >
          Register and check in
        </button>
        <button type="button" onClick={() => p.onOpenChange(false)}>
          Cancel
        </button>
      </div>
    ) : null,
}));

vi.mock("../components/ReprintLabelDialog", () => ({
  ReprintLabelDialog: (p: {
    open: boolean;
    sessionId: string | null;
    onOpenChange: (open: boolean) => void;
    onReprinted: (rows: unknown[], tags: unknown[]) => void;
  }) => {
    const rows = [
      {
        batch_id: "b7",
        pickup_code: "K3PT",
        pickup_token: "tok1",
        household_name: "Bekele",
        check_in_id: "c1",
        child_name: "Abel Bekele",
        room_name: "Shine 4th Grade",
        tag_number: 11,
        allergy_label: null,
        guardian_phone: null,
      },
      {
        batch_id: "b7",
        pickup_code: "K3PT",
        pickup_token: "tok1",
        household_name: "Bekele",
        check_in_id: "c2",
        child_name: "Hana Bekele",
        room_name: "Little Lambs",
        tag_number: 12,
        allergy_label: null,
        guardian_phone: null,
      },
    ];
    return p.open ? (
      <div role="dialog" aria-label="Reprint a pickup slip">
        <span data-testid="reprint-session">{p.sessionId ?? "any"}</span>
        <button type="button" onClick={() => p.onReprinted(rows, rows)}>
          Print a new slip
        </button>
        <button type="button" onClick={() => p.onReprinted(rows, [])}>
          Print the slip without tags
        </button>
      </div>
    ) : null;
  },
}));

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
    },
    {
      household_id: "h1",
      household_name: "Bekele",
      child_person_id: SARA,
      child_name: "Sara Bekele",
      photo_path: null,
      grade_name: "Grade 1",
      already_checked_in: false,
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

    // The default is selected before anything is committed, and it says how
    // the room is decided rather than naming one. The kiosk is not told where
    // a child will land - pick_room_for_child decides at commit time - so a
    // named room here would be a guess presented as a fact.
    const [abel, sara] = screen.getAllByRole("combobox");
    expect(abel).toHaveDisplayValue("Chosen by their grade");
    expect(sara).toHaveDisplayValue("Chosen by their grade");

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
    // Sara's is untouched and still on the default.
    expect(sara).toHaveDisplayValue("Chosen by their grade");

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

    // And selecting it does nothing — the dropdown stays where it was rather
    // than quietly accepting a room that will refuse the whole family at the
    // last moment.
    const [abel] = screen.getAllByRole("combobox");
    await user.selectOptions(abel, REDEEMED);
    expect(abel).toHaveDisplayValue("Chosen by their grade");
  });

  it("lets a parent undo a choice back to the default", async () => {
    const user = userEvent.setup();
    await reachChildren(user);

    const [abel] = screen.getAllByRole("combobox");
    await user.selectOptions(abel, JOY);
    // Back to the first option, which is the undo: "" sends a null again.
    await user.selectOptions(abel, "");
    expect(abel).toHaveDisplayValue("Chosen by their grade");

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

const LYDIA = "bbbbbbbb-0000-0000-0000-000000000001";
const NOAH = "bbbbbbbb-0000-0000-0000-000000000002";

describe("the welcome screen's two secondary actions", () => {
  it("offers a visiting family and a lost slip under Start", async () => {
    render(<KioskPage />);
    expect(await screen.findByRole("button", { name: /^start$/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /first time here/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /lost your slip/i })).toBeEnabled();
  });

  it("keeps Lost your slip? open when check-in is closed, and nothing else", async () => {
    // A slip goes missing at pick-up, which is after the service has ended.
    bootstrap.mockResolvedValue({
      kids_session_id: SESSION,
      session_label: "Second Service",
      session_date: "2026-09-27",
      status: "closed",
      station_name: "Lobby tablet",
      station_known: true,
      open_room_count: 0,
    });
    render(<KioskPage />);
    await screen.findByText(/check-in is not open/i);
    expect(screen.getByRole("button", { name: /^start$/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /first time here/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /lost your slip/i })).toBeEnabled();
  });

  it("checks a newly registered family in like any other", async () => {
    const user = userEvent.setup();
    render(<KioskPage />);
    await user.click(await screen.findByRole("button", { name: /first time here/i }));
    await user.click(screen.getByRole("button", { name: /register and check in/i }));

    // Straight onto the children screen, with the form gone and every child
    // selected: the next tap is the check-in.
    await screen.findByRole("heading", { name: /who is here this morning/i });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Lydia T.")).toBeInTheDocument();
    expect(screen.getByText("Noah T.")).toBeInTheDocument();
    expect(screen.getAllByText("Checking in")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: /check in 2 children/i }));
    await screen.findByRole("heading", { name: /all done/i });
    // Their ids, positionally, with no room chosen — nothing downstream knows
    // they are new.
    expect(roomIdsFromLastCheckIn()).toEqual({ [LYDIA]: null, [NOAH]: null });
    await waitFor(() => expect(printLabels).toHaveBeenCalledTimes(1));
    expect(printLabels.mock.calls[0][1]).toMatchObject({ householdName: "Tesfaye" });
  });

  it("offers the visitor form when a number matches nobody, with the number carried in", async () => {
    findByPhone.mockResolvedValueOnce([]);
    const user = userEvent.setup();
    render(<KioskPage />);
    await user.click(await screen.findByRole("button", { name: /^start$/i }));
    for (const d of "3015550147") {
      await user.click(screen.getByRole("button", { name: d }));
    }
    await user.click(screen.getByRole("button", { name: /find my children/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/could not find that number/i),
    );
    await user.click(screen.getByRole("button", { name: /first time here/i }));
    expect(screen.getByRole("dialog", { name: /visiting family/i })).toBeInTheDocument();
    expect(screen.getByTestId("visitor-initial-query")).toHaveTextContent("(301) 555-0147");
  });

  it("does not offer the visitor form for a rate limit", async () => {
    // "Register again" is the wrong answer to a question the database refused
    // to hear.
    findByPhone.mockRejectedValueOnce(new Error("too_many_attempts"));
    const user = userEvent.setup();
    render(<KioskPage />);
    await user.click(await screen.findByRole("button", { name: /^start$/i }));
    for (const d of "3015550147") {
      await user.click(screen.getByRole("button", { name: d }));
    }
    await user.click(screen.getByRole("button", { name: /find my children/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/see a kids ministry volunteer/i),
    );
    expect(screen.queryByRole("button", { name: /first time here/i })).not.toBeInTheDocument();
  });

  it("replaces a lost slip with the same code and every tag", async () => {
    const user = userEvent.setup();
    render(<KioskPage />);
    await user.click(await screen.findByRole("button", { name: /lost your slip/i }));
    // Scoped to this service, as the desk scopes it.
    expect(screen.getByTestId("reprint-session")).toHaveTextContent(SESSION);
    await user.click(screen.getByRole("button", { name: /print a new slip/i }));

    await screen.findByRole("heading", { name: /here is your new slip/i });
    expect(screen.getByText("K3PT")).toBeInTheDocument();
    expect(screen.getByText(/same code as before/i)).toBeInTheDocument();
    expect(screen.getByText("Abel Bekele").closest("li")).toHaveTextContent("Shine 4th Grade");

    // Printed through the same path as a check-in, with the family's own code.
    await waitFor(() => expect(printLabels).toHaveBeenCalledTimes(1));
    const [childLabels, parentSlip] = printLabels.mock.calls[0];
    expect(parentSlip).toMatchObject({
      householdName: "Bekele",
      pickupCode: "K3PT",
      childCount: 2,
      serviceLabel: "Second Service",
    });
    expect(childLabels).toHaveLength(2);
    expect(childLabels[0]).toMatchObject({ childName: "Abel Bekele", pickupCode: "K3PT" });
    expect(checkIn).not.toHaveBeenCalled();
  });

  it("prints only the parent slip when every tag is left out", async () => {
    const user = userEvent.setup();
    render(<KioskPage />);
    await user.click(await screen.findByRole("button", { name: /lost your slip/i }));
    await user.click(screen.getByRole("button", { name: /without tags/i }));

    await waitFor(() => expect(printLabels).toHaveBeenCalledTimes(1));
    const [childLabels, parentSlip] = printLabels.mock.calls[0];
    expect(childLabels).toEqual([]);
    // The slip still counts both children: the code collects both.
    expect(parentSlip).toMatchObject({ pickupCode: "K3PT", childCount: 2 });
    // And the done screen still says where both of them are.
    expect(screen.getByText("Hana Bekele").closest("li")).toHaveTextContent("Little Lambs");
  });

  it("wipes an open form when nobody touches the screen", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<KioskPage />);
      await user.click(await screen.findByRole("button", { name: /first time here/i }));
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(46_000);
      });
      // Gone, and UNMOUNTED — the next parent does not reopen this family.
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.getByRole("heading", { name: /welcome/i })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
