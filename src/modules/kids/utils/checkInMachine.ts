/**
 * Check-in station state machine.
 *
 * A pure reducer, deliberately kept out of React so the whole Sunday-morning
 * flow can be tested without rendering anything. This is the part that must
 * not have holes: no path may reach "checked in" without a confirmed
 * volunteer, a session, a household and at least one child.
 *
 * The station is ONE route with an internal machine rather than nested routes,
 * because a kiosk must not have a working browser Back button — a parent
 * hitting Back mid-flow would otherwise land on a half-completed check-in.
 */

export type StationState =
  | "unconfigured"   // no station chosen on this device yet
  | "locked"         // station chosen, no volunteer signed in
  | "idle"           // volunteer on shift, waiting for the next family
  | "searching"      // looking up a household
  | "selecting"      // household found, choosing children
  | "confirming"     // reviewing classroom assignment before committing
  | "success"        // checked in, code on screen
  | "checkout_find"  // entering a pickup code
  | "checkout_confirm"
  | "checkout_done";

export interface HouseholdMatch {
  household_id: string;
  household_name: string;
  masked_phone: string | null;
  children: {
    child_person_id: string;
    child_display_name: string;
    age_band_code: string | null;
    /** What decides the classroom. Null for a child with no grade on file. */
    grade_name: string | null;
    already_checked_in: boolean;
    needs_staff: boolean;
  }[];
}

/** A child check_in_children declined to check in, and why. */
export interface RefusedChild {
  child_person_id: string;
  child_name: string;
  refusal_code: string | null;
  refusal_message: string | null;
}

export interface CheckedInChild {
  check_in_id: string;
  /**
   * Optional because the check-in path builds these rows from
   * church.check_in_children and the checkout path from
   * church.station_resolve_pickup; both carry it, but a row reconstructed from
   * a persisted device state written before this field existed does not.
   * Only the photograph needs it, and a missing face is initials.
   */
  child_person_id?: string;
  child_name: string;
  room_name: string | null;
  tag_number: number;
  allergy_label: string | null;
  has_restriction: boolean;
}

/** Someone the database says may collect this child. */
export interface PickupCandidate {
  person_id: string;
  display_name: string;
  relationship: string;
  is_authorized: boolean;
  is_guardian: boolean;
  child_has_restriction: boolean;
  /**
   * This person handed the child over this morning.
   *
   * NOT an authorisation — it rides alongside is_authorized and is_guardian
   * and changes neither. Bringing a child in does not earn the right to take
   * them out, and a restricted person is excluded from the list either way.
   * All it does is decide which name is offered first.
   */
  dropped_off?: boolean;
}

export interface MachineContext {
  state: StationState;
  stationId: string | null;
  stationName: string | null;
  volunteerName: string | null;
  canOverride: boolean;
  query: string;
  household: HouseholdMatch | null;
  selectedChildIds: string[];
  /** Per-child room override, keyed by child person id. */
  roomOverrides: Record<string, string>;
  pickupCode: string | null;
  pickupToken: string | null;
  checkedIn: CheckedInChild[];
  /**
   * Children the database REFUSED in a batch that otherwise succeeded.
   *
   * A refusal is data, not an exception: check_in_children returns a row per
   * child with `refused` set rather than raising, so that one blocked child
   * cannot abort the transaction and destroy their siblings' check-in. The
   * success screen has to say who did not get in, or a parent walks away
   * believing all three children are in classrooms.
   */
  refused: RefusedChild[];
  checkoutInput: string;
  checkoutMatches: CheckedInChild[];
  /**
   * Which of the matched children are being collected AT THIS DOOR.
   *
   * Siblings are routinely in different classrooms, so a parent works their
   * way round the building with one code. Releasing the whole batch at the
   * first door would mark two children collected while they are still sitting
   * in Joy B and Redeemed A — the roster would say they had gone home.
   */
  checkoutSelected: string[];
  /** Who the database says may collect the matched children. */
  pickupCandidates: PickupCandidate[];
  /** The person the volunteer says is collecting. */
  collectorPersonId: string | null;
  collectorName: string | null;
  error: string | null;
  /**
   * Set when a classroom is full: holds the family name for the warning copy.
   *
   * Lives in the machine rather than in component state so that clearFamily()
   * clears it on EVERY reset path — including the 45-second idle wipe, which
   * previously left an amber dialog open over the search screen still naming
   * the previous household.
   */
  capacityBlocked: string | null;
  /**
   * A failure the volunteer must acknowledge before carrying on, as opposed
   * to `error`, which is inline hint text. A check-in that failed is shown as
   * a blocking modal: the tablet must never let a label be handed over when
   * the database has no matching row.
   */
  blockingError: string | null;
  /**
   * Households whose consent sheet has been shown and set aside this session.
   *
   * ONCE PER HOUSEHOLD, NOT ONCE PER CHILD. 216 unsigned families times a
   * per-child dialog is roughly 1,200 dialogs a month, which is how
   * volunteers learn to tap past things — and then the enforcement date
   * arrives having changed nobody's behaviour at all.
   *
   * It lives here rather than in component state so that clearFamily() wipes
   * it on EVERY reset path, the 45-second idle timer included. A tablet that
   * remembered dismissals across families would quietly stop asking.
   */
  consentDismissed: string[];
}

export const initialContext: MachineContext = {
  state: "unconfigured",
  stationId: null,
  stationName: null,
  volunteerName: null,
  canOverride: false,
  query: "",
  household: null,
  selectedChildIds: [],
  roomOverrides: {},
  pickupCode: null,
  pickupToken: null,
  checkedIn: [],
  refused: [],
  checkoutInput: "",
  checkoutMatches: [],
  checkoutSelected: [],
  pickupCandidates: [],
  collectorPersonId: null,
  collectorName: null,
  error: null,
  capacityBlocked: null,
  blockingError: null,
  consentDismissed: [],
};

export type MachineEvent =
  | { type: "STATION_SET"; stationId: string; stationName: string }
  | { type: "STATION_CLEARED" }
  | { type: "SHIFT_STARTED"; volunteerName: string; canOverride: boolean }
  | { type: "SHIFT_ENDED" }
  | { type: "QUERY_CHANGED"; query: string }
  | { type: "HOUSEHOLD_SELECTED"; household: HouseholdMatch }
  | { type: "CHILD_TOGGLED"; childId: string }
  | { type: "ROOM_OVERRIDDEN"; childId: string; roomId: string }
  | { type: "CONFIRM_REQUESTED" }
  | { type: "CONSENT_SET_ASIDE"; householdId: string }
  | {
      type: "CHECKED_IN";
      code: string;
      token: string;
      children: CheckedInChild[];
      refused?: RefusedChild[];
    }
  | { type: "CHECKOUT_STARTED" }
  | { type: "CHECKOUT_INPUT"; value: string }
  | { type: "CHECKOUT_RESOLVED"; matches: CheckedInChild[] }
  | { type: "TOGGLE_CHECKOUT_CHILD"; checkInId: string }
  | { type: "CHECKOUT_CANDIDATES"; candidates: PickupCandidate[] }
  | { type: "COLLECTOR_SELECTED"; personId: string | null; name: string | null }
  | { type: "CHECKOUT_DONE" }
  | { type: "ERROR"; message: string }
  | { type: "BLOCKING_ERROR"; message: string }
  | { type: "DISMISS_BLOCKING" }
  | { type: "CAPACITY_BLOCKED"; householdName: string }
  | { type: "DISMISS_CAPACITY" }
  | { type: "RESET" };

/**
 * Everything a family-specific screen holds is cleared on reset. This matters
 * on a shared station: the next parent must never see the previous family's
 * children or pickup code.
 */
function clearFamily(ctx: MachineContext): MachineContext {
  return {
    ...ctx,
    query: "",
    household: null,
    selectedChildIds: [],
    roomOverrides: {},
    pickupCode: null,
    pickupToken: null,
    checkedIn: [],
  refused: [],
    checkoutInput: "",
    checkoutMatches: [],
  checkoutSelected: [],
    pickupCandidates: [],
    collectorPersonId: null,
    collectorName: null,
    error: null,
    capacityBlocked: null,
    blockingError: null,
    consentDismissed: [],
  };
}

export function reduce(ctx: MachineContext, event: MachineEvent): MachineContext {
  switch (event.type) {
    case "STATION_SET":
      return {
        ...clearFamily(ctx),
        state: "locked",
        stationId: event.stationId,
        stationName: event.stationName,
        volunteerName: null,
        canOverride: false,
      };

    case "STATION_CLEARED":
      return { ...initialContext };

    case "SHIFT_STARTED":
      return {
        ...clearFamily(ctx),
        state: "idle",
        volunteerName: event.volunteerName,
        canOverride: event.canOverride,
      };

    case "SHIFT_ENDED":
      // Back to locked, never to idle: no volunteer means no check-ins.
      return {
        ...clearFamily(ctx),
        state: ctx.stationId ? "locked" : "unconfigured",
        volunteerName: null,
        canOverride: false,
      };

    case "QUERY_CHANGED":
      if (ctx.state !== "idle" && ctx.state !== "searching") return ctx;
      return {
        ...ctx,
        query: event.query,
        state: event.query.trim().length >= 3 ? "searching" : "idle",
        household: null,
        error: null,
      };

    case "HOUSEHOLD_SELECTED": {
      if (ctx.state !== "searching") return ctx;
      // Children already checked in are pre-excluded rather than merely
      // greyed out, so a double tap cannot resubmit them.
      const selectable = event.household.children
        .filter((c) => !c.already_checked_in && !c.needs_staff)
        .map((c) => c.child_person_id);
      return {
        ...ctx,
        state: "selecting",
        household: event.household,
        selectedChildIds: selectable,
        error: null,
      };
    }

    case "CHILD_TOGGLED": {
      if (ctx.state !== "selecting") return ctx;
      const child = ctx.household?.children.find(
        (c) => c.child_person_id === event.childId
      );
      // A child already checked in, or flagged for staff attention, is never
      // selectable from the ordinary flow.
      if (!child || child.already_checked_in || child.needs_staff) return ctx;
      const has = ctx.selectedChildIds.includes(event.childId);
      return {
        ...ctx,
        selectedChildIds: has
          ? ctx.selectedChildIds.filter((id) => id !== event.childId)
          : [...ctx.selectedChildIds, event.childId],
      };
    }

    case "ROOM_OVERRIDDEN":
      if (ctx.state !== "selecting" && ctx.state !== "confirming") return ctx;
      return {
        ...ctx,
        roomOverrides: { ...ctx.roomOverrides, [event.childId]: event.roomId },
      };

    case "CONFIRM_REQUESTED":
      if (ctx.state !== "selecting" || ctx.selectedChildIds.length === 0) return ctx;
      return { ...ctx, state: "confirming", error: null, capacityBlocked: null };

    case "CONSENT_SET_ASIDE":
      // Idempotent: a volunteer tapping twice must not grow the list.
      if (ctx.consentDismissed.includes(event.householdId)) return ctx;
      return {
        ...ctx,
        consentDismissed: [...ctx.consentDismissed, event.householdId],
      };

    case "CHECKED_IN":
      // Accepted from `selecting` as well as `confirming`. A committed
      // check-in must not be discarded because the screen moved on — the
      // pickup code is stored as a peppered hash, so this is the only copy
      // that will ever exist. Still refused from idle/locked/unconfigured:
      // reaching "checked in" without a family on screen is the hole the
      // machine exists to prevent.
      if (ctx.state !== "confirming" && ctx.state !== "selecting") return ctx;
      return {
        ...ctx,
        state: "success",
        capacityBlocked: null,
        pickupCode: event.code,
        pickupToken: event.token,
        checkedIn: event.children,
        refused: event.refused ?? [],
        error: null,
      };

    case "CHECKOUT_STARTED":
      if (ctx.state !== "idle") return ctx;
      return { ...clearFamily(ctx), state: "checkout_find" };

    case "CHECKOUT_INPUT":
      if (ctx.state !== "checkout_find") return ctx;
      return { ...ctx, checkoutInput: event.value, error: null };

    case "CHECKOUT_RESOLVED":
      if (ctx.state !== "checkout_find") return ctx;
      // Zero matches is a denial, not a state change — the caller shows the
      // generic "not recognised" message and stays put.
      if (event.matches.length === 0) {
        return { ...ctx, error: "That code was not recognised." };
      }
      return {
        ...ctx,
        state: "checkout_confirm",
        checkoutMatches: event.matches,
        // Everyone by default: the common case is one room, or a parent doing
        // the whole round at once. The volunteer unticks whoever is not here.
        checkoutSelected: event.matches.map((m) => m.check_in_id),
        pickupCandidates: [],
        collectorPersonId: null,
        collectorName: null,
      };

    case "TOGGLE_CHECKOUT_CHILD": {
      if (ctx.state !== "checkout_confirm") return ctx;
      const on = ctx.checkoutSelected.includes(event.checkInId);
      return {
        ...ctx,
        checkoutSelected: on
          ? ctx.checkoutSelected.filter((id) => id !== event.checkInId)
          : [...ctx.checkoutSelected, event.checkInId],
        error: null,
      };
    }

    case "CHECKOUT_CANDIDATES":
      if (ctx.state !== "checkout_confirm") return ctx;
      return { ...ctx, pickupCandidates: event.candidates };

    case "COLLECTOR_SELECTED":
      if (ctx.state !== "checkout_confirm") return ctx;
      return {
        ...ctx,
        collectorPersonId: event.personId,
        collectorName: event.name,
        error: null,
      };

    case "CHECKOUT_DONE":
      if (ctx.state !== "checkout_confirm") return ctx;
      return { ...ctx, state: "checkout_done" };

    case "ERROR":
      // A failure while committing must hand the screen BACK to the volunteer
      // in a state they can act on. Staying in "confirming" left the retry
      // button rendered, enabled and inert, because it only fires from
      // "selecting" — the volunteer's only exit was to cancel the family.
      if (ctx.state === "confirming") {
        return { ...ctx, state: "selecting", error: event.message };
      }
      return { ...ctx, error: event.message };

    case "BLOCKING_ERROR":
      // Same state transition as ERROR, plus a modal the volunteer has to
      // dismiss, so a failed check-in cannot be mistaken for a quiet success.
      return {
        ...ctx,
        state: ctx.state === "confirming" ? "selecting" : ctx.state,
        blockingError: event.message,
      };

    case "DISMISS_BLOCKING":
      return { ...ctx, blockingError: null };

    case "CAPACITY_BLOCKED":
      // Returns to 'selecting' for the same reason ERROR does: leaving the
      // machine in 'confirming' renders the whole select screen enabled and
      // inert, because its controls only fire from 'selecting'.
      return {
        ...ctx,
        state: ctx.state === "confirming" ? "selecting" : ctx.state,
        capacityBlocked: event.householdName,
        error: null,
      };

    case "DISMISS_CAPACITY":
      return { ...ctx, capacityBlocked: null };

    case "RESET":
      // Returns to idle only when a volunteer is still on shift.
      return {
        ...clearFamily(ctx),
        state: ctx.volunteerName ? "idle" : ctx.stationId ? "locked" : "unconfigured",
      };

    default:
      return ctx;
  }
}

/** Screens that must auto-return to idle after a period of no input. */
export function shouldAutoReset(state: StationState): boolean {
  return state === "success" || state === "checkout_done" || state === "selecting";
}

/** True when the current screen shows a family's details to the room. */
export function showsFamilyData(state: StationState): boolean {
  return (
    state === "selecting" ||
    state === "confirming" ||
    state === "success" ||
    state === "checkout_confirm"
  );
}
