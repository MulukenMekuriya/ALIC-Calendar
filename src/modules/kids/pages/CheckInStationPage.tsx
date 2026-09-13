/**
 * Kids check-in station.
 *
 * Full-screen kiosk, deliberately NOT wrapped in DashboardLayout: no sidebar,
 * no nav, nowhere to wander while a queue of parents waits.
 *
 * SIMPLE MODEL: the volunteer is whoever is signed in. There is no shared
 * device account, no PIN and no shift token — signing in already identifies
 * them, so every check-in is attributed without extra ceremony. The database
 * enforces the same thing: resolve_actor() reads auth.uid() directly.
 *
 * One route with an internal state machine rather than nested routes, so the
 * browser Back button cannot drop a parent into a half-finished check-in.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Badge } from "@/shared/components/ui/badge";
import { Label } from "@/shared/components/ui/label";
import {
  Loader2,
  Search,
  ArrowLeft,
  Printer,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  WifiOff,
  Baby,
  UserPlus,
  Play,
  DoorOpen,
  HeartPulse,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { useAuth } from "@/shared/contexts/AuthContext";
import { useOrganization } from "@/shared/contexts/OrganizationContext";
import { useCapabilities } from "@/shared/hooks/useCapabilities";
import { useUserProfile } from "@/hooks/useUserProfile";
import { kidsStationService, kidsSessionService, printLabels, renderQrSvg } from "../services";
import { StationRoomsPanel } from "../components/StationRoomsPanel";
import { VisitorFamilyDialog } from "../components/VisitorFamilyDialog";
import { ReprintLabelDialog } from "../components/ReprintLabelDialog";
import { errorMessage, isDbError } from "../services/rpcError";
import { cn } from "@/lib/utils";

/**
 * crypto.randomUUID() exists only in a SECURE CONTEXT. A lobby tablet on the
 * church LAN over plain http has `crypto` but not `randomUUID`, so calling it
 * bare during render threw and the kiosk rendered blank — on the one screen
 * that has to work at 10:15 on a Sunday.
 *
 * This value is an idempotency key, not a credential: it only has to be
 * unique per attempt on one device, so a time-plus-random fallback is fine.
 */
function attemptId(): string {
  return (
    crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2, 15)}`
  );
}
import { reduce, initialContext, showsFamilyData, type HouseholdMatch } from "../utils/checkInMachine";
import { formatSessionDate, formatClockTime } from "../utils/sessionDate";
import type {
  HouseholdAdultRow,
  HouseholdSearchRow,
  KidsSession,
  SafetyCard,
  StationRoom,
} from "../types";

const AUTO_RESET_MS = 20_000;
/** Wipe a family's details from a shared screen after this long with no input. */
const FAMILY_IDLE_MS = 45_000;

export default function CheckInStationPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const { currentOrganization } = useOrganization();
  const { can } = useCapabilities();
  // Only a kids_admin may release a child the gate refused. The database
  // enforces the same rule; this only decides whether the option is offered.
  const canOverride = can("kids.override");
  const orgId = currentOrganization?.id;

  const [ctx, dispatch] = useReducer(reduce, initialContext);
  const [session, setSession] = useState<KidsSession | null>(null);
  const [results, setResults] = useState<HouseholdSearchRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [printNote, setPrintNote] = useState<string | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  // The classroom-volunteer view. Not part of the check-in state machine:
  // it is a side panel a volunteer steps into and back out of, and it must
  // not disturb a half-finished check-in behind it.
  const [showRooms, setShowRooms] = useState(false);
  /** Open classrooms, for keeping siblings together at the desk. */
  const [openRooms, setOpenRooms] = useState<StationRoom[]>([]);
  /** Set when a lead chooses to release a child the gate refused. */
  const [overriding, setOverriding] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideCheck, setOverrideCheck] = useState("");
  const [safety, setSafety] = useState<SafetyCard | null>(null);
  /** The New Family desk: a visitor who is not in the directory yet. */
  const [addingVisitor, setAddingVisitor] = useState(false);
  /** Household adults, for "who is dropping off?". */
  const [adults, setAdults] = useState<HouseholdAdultRow[]>([]);
  const [droppedOffBy, setDroppedOffBy] = useState<string | null>(null);
  /**
   * The name printed beside the phone number on the tag.
   *
   * The adult the desk recorded, and failing that the household — a number
   * with nothing beside it tells a volunteer who to dial but not who they are
   * about to reach. `adults` is empty for a household with no adult records on
   * file, which is exactly when the household name is the only name there is.
   */
  const tagContactName = () =>
    adults.find((a) => a.person_id === droppedOffBy)?.display_name ??
    ctx.household?.household_name ??
    null;
  /** A parent has lost their slip and needs a new code. */
  const [reprinting, setReprinting] = useState(false);
  /**
   * Check-in needs an OPEN session; checking out does not.
   *
   * The server has always drawn the line here — check_out_children never reads
   * session status. The desk now draws it in the same place instead of going
   * dark entirely.
   */
  const sessionClosed = !!session && session.status !== "open";
  const [safetyFor, setSafetyFor] = useState<string | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const idleTimer = useRef<number | null>(null);
  /**
   * Makes the idempotency key unique PER ATTEMPT.
   *
   * The key used to be session+household+children, identical every time the
   * same family was checked in. check_in_children short-circuits on a
   * matching key without testing whether that batch is still active, so a
   * family returning after a checkout replayed the finished batch: the screen
   * said "Checked in", a label printed, and the database recorded nothing —
   * a child in a room that appears on no roster, holding a dead code.
   *
   * Kept STABLE across a retry of the same attempt (network failure, capacity
   * override), which is the case the idempotency key exists for, and rotated
   * when a new family is started.
   */
  const attemptKey = useRef<string>(attemptId());

  /* ----------------------------------------------------------- connection */
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  /* --------------------------------------------------------------- start */
  // The signed-in user IS the volunteer, so the machine goes straight to a
  // working state as soon as a session is open.
  useEffect(() => {
    if (!orgId || !user) return;
    kidsSessionService
      // Open OR closed. A closed session still has children in rooms, and the
      // desk must keep checkout, the roster and the safety card — that is the
      // end of the service, when they matter most.
      .currentForDesk(orgId)
      .then((s) => {
        setSession(s);
        if (s) {
          dispatch({
            type: "SHIFT_STARTED",
            volunteerName: profile?.full_name || "Volunteer",
            canOverride,
          });
        }
      })
      .catch(() => setSession(null));
  }, [orgId, user, profile?.full_name]);

  /**
   * Who is dropping off. Loaded as soon as a family is chosen, so the answer is
   * on screen while the volunteer is still selecting children rather than being
   * one more thing to wait for at the end.
   */
  useEffect(() => {
    const hh = ctx.household?.household_id;
    if (!hh) {
      setAdults([]);
      setDroppedOffBy(null);
      return;
    }
    let cancelled = false;
    kidsStationService
      .householdAdults(hh)
      .then((rows) => {
        if (cancelled) return;
        setAdults(rows);
        // Default to the primary contact — right most of the time, and one tap
        // to change when it is not. Left null when the household has exactly
        // one adult only if there are none at all.
        setDroppedOffBy(
          rows.find((r) => r.is_primary_contact)?.person_id ??
            rows[0]?.person_id ??
            null
        );
      })
      // Never blocks a check-in. A child in a room matters more than knowing
      // which parent walked them in.
      .catch(() => {
        if (!cancelled) setAdults([]);
      });
    return () => {
      cancelled = true;
    };
  }, [ctx.household?.household_id]);

  const startToday = async () => {
    if (!orgId) return;
    setStarting(true);
    setStartError(null);
    try {
      const opened = await kidsSessionService.openToday(orgId);
      const open = await kidsSessionService.listOpen(orgId);
      setSession(open.find((s) => s.id === opened.session_id) ?? open[0] ?? null);
      dispatch({
        type: "SHIFT_STARTED",
        volunteerName: profile?.full_name || "Volunteer",
        canOverride,
      });
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      setStartError(
        raw.includes("no_classrooms_configured")
          ? "No classrooms are set up yet. An admin needs to mark which rooms take children."
          : raw.includes("not_permitted")
            ? "You do not have permission to run check-in."
            : raw
      );
    } finally {
      setStarting(false);
    }
  };

  /* ------------------------------------------------------------ idle wipe */
  const resetIdle = useCallback(() => {
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
    if (!showsFamilyData(ctx.state)) return;
    // Never wipe while the check-in RPC is outstanding. 'confirming' exists
    // only for the duration of that call, and wiping mid-flight discards the
    // CHECKED_IN result — destroying the only copy of the pickup code, which
    // is stored as a peppered hash and cannot be recovered by anyone.
    if (busy) return;
    idleTimer.current = window.setTimeout(() => {
      dispatch({ type: "RESET" });
      setResults([]);
    }, FAMILY_IDLE_MS);
  }, [ctx.state, busy]);

  useEffect(() => {
    resetIdle();
    return () => {
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
    };
  }, [resetIdle]);

  useEffect(() => {
    if (ctx.state !== "success" && ctx.state !== "checkout_done") return;
    const t = window.setTimeout(() => {
      dispatch({ type: "RESET" });
      setResults([]);
      setPrintNote(null);
    }, AUTO_RESET_MS);
    return () => window.clearTimeout(t);
  }, [ctx.state]);

  useEffect(() => {
    if (ctx.state === "idle") searchInput.current?.focus();
  }, [ctx.state]);

  // Loaded once a session is open, so the room picker has somewhere to point.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    kidsStationService
      .sessionRooms(session.id)
      .then((rooms) => {
        if (!cancelled) setOpenRooms(rooms);
      })
      .catch(() => {
        // A missing picker is a degraded desk, not a broken one: check-in
        // still places by grade.
        if (!cancelled) setOpenRooms([]);
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  /* ------------------------------------------------------------- handlers */
  const runSearch = async (query: string) => {
    dispatch({ type: "QUERY_CHANGED", query });
    if (query.trim().length < 3 || !session) {
      setResults([]);
      return;
    }
    try {
      setResults(await kidsStationService.searchHouseholds(query.trim(), session.id));
    } catch {
      setResults([]);
    }
  };

  /** Search returns one row per child; the screen needs one card per family. */
  const households = useMemo<HouseholdMatch[]>(() => {
    const byId = new Map<string, HouseholdMatch>();
    for (const row of results) {
      if (!byId.has(row.household_id)) {
        byId.set(row.household_id, {
          household_id: row.household_id,
          household_name: row.household_name,
          masked_phone: row.masked_phone,
          children: [],
        });
      }
      byId.get(row.household_id)!.children.push({
        child_person_id: row.child_person_id,
        child_display_name: row.child_display_name,
        age_band_code: row.age_band_code,
        grade_name: row.grade_name,
        already_checked_in: row.already_checked_in,
        needs_staff: row.needs_staff,
      });
    }
    return [...byId.values()];
  }, [results]);

  /**
   * Turn a raw database error into something a volunteer can act on with a
   * queue of parents in front of them. `room_at_capacity` is handled by the
   * caller and never reaches here.
   */
  /**
   * Turn a database error into something a volunteer can act on with a queue
   * of parents in front of them.
   *
   * Matched on the exact identifier, not a substring. The old `includes("session")`
   * test caught anything with that word in it — a PostgREST schema-cache miss
   * was reported as "this service is no longer open", which is a confident
   * answer to a different question. Anything unrecognised is shown as-is
   * rather than guessed at: a raw identifier is ugly, a wrong explanation
   * sends someone to fix the wrong thing.
   */
  const explainCheckInError = (raw: string): string => {
    const known: Record<string, string> = {
      session_not_open:
        "This service has been closed. Reopen it from the Kids Ministry page.",
      session_not_found:
        "This service no longer exists. Go back and start check-in again.",
      outside_check_in_window:
        "Check-in is closed for this service right now.",
      no_open_classroom:
        "No classroom is open. Someone needs to open one on the Kids Ministry page.",
      no_classrooms_configured:
        "No classrooms are set up yet. An admin needs to mark which rooms take children.",
      not_permitted_to_check_in: "You do not have permission to check children in.",
      volunteer_not_eligible:
        "Your volunteer record is marked restricted, so you cannot run check-in.",
      child_not_found: "That child's record could not be found. Refresh and try again.",
      no_children_supplied: "No children were selected.",
      room_not_open: "That classroom is closed. Choose another room.",
    };

    for (const [code, message] of Object.entries(known)) {
      if (raw.includes(code)) return message;
    }

    if (raw.includes("uq_kids_check_ins_one_active_per_session")) {
      return "One of these children is already checked in. Refresh and look them up again.";
    }
    if (raw.includes("Failed to fetch") || raw.includes("NetworkError")) {
      return "Lost connection while saving. The check-in may or may not have gone through — look the family up again before printing anything.";
    }
    return raw;
  };

  /**
   * Why a checkout LOOKUP threw.
   *
   * Says nothing about the code itself — it cannot, because a code-related
   * denial never reaches here. It reports the operator or infrastructure
   * failure, which is information the desk needs and an attacker cannot use.
   */
  const explainCheckoutError = (err: unknown): string => {
    const raw = errorMessage(err);
    if (raw.includes("not_permitted_to_check_out")) {
      return "You do not have permission to check children out. Ask a kids admin to grant it.";
    }
    if (raw.includes("volunteer_not_eligible")) {
      return "Your volunteer record is marked restricted, so you cannot release children.";
    }
    if (raw.includes("Failed to fetch") || raw.includes("NetworkError")) {
      return "Lost connection. Do not release anyone until the code has been checked again.";
    }
    if (isDbError(err, "PGRST202") || raw.includes("schema cache")) {
      return "The station is out of date with the server. Reload the page and try again.";
    }
    return `Could not check that code: ${raw}`;
  };

  /** KID-018: pull the safety card for one child. Audited server-side. */
  const openSafetyCard = async (checkInId: string) => {
    setSafety(null);
    setSafetyFor(checkInId);
    try {
      const card = await kidsStationService.safetyCard(checkInId);
      if (card) {
        setSafety(card);
      } else {
        setSafetyFor(null);
        dispatch({
          type: "BLOCKING_ERROR",
          message: "No safety card is on file for this child.",
        });
      }
    } catch (err) {
      setSafetyFor(null);
      dispatch({
        type: "BLOCKING_ERROR",
        message: "Could not load the safety card: " + errorMessage(err),
      });
    }
  };

  const doCheckIn = async (overrideCapacity = false, reason?: string) => {
    if (!session || ctx.selectedChildIds.length === 0) return;
    setBusy(true);
    try {
      // Idempotency key: if the response is lost and the tablet retries, the
      // RPC returns the ORIGINAL batch with a rotated code rather than
      // checking the same children in twice.
      const batchKey =
        `${session.id}:${ctx.household?.household_id}:` +
        `${[...ctx.selectedChildIds].sort().join(",")}:${attemptKey.current}`;
      const rows = await kidsStationService.checkIn({
        sessionId: session.id,
        childIds: ctx.selectedChildIds,
        clientBatchKey: batchKey,
        // Positional, matching _child_person_ids: null means "decide by
        // grade". Without this the machine's roomOverrides were dead state and
        // siblings could not be kept together.
        roomIds: ctx.selectedChildIds.map(
          (id) => ctx.roomOverrides[id] ?? null
        ),
        droppedOffByPersonId: droppedOffBy,
        overrideCapacity,
        assignmentReason: reason ?? null,
      });
      if (rows.length === 0) {
        // No rows and no error means nothing was written, so there is no label
        // to hand over. That has to be acknowledged, not glanced at.
        dispatch({
          type: "BLOCKING_ERROR",
          message:
            "Check-in did not complete and nothing was saved. Do NOT hand out a label. Try again.",
        });
        return;
      }
      dispatch({
        type: "CHECKED_IN",
        code: rows[0].pickup_code,
        token: rows[0].pickup_token,
        children: rows.map((r) => ({
          check_in_id: r.check_in_id,
          child_name: r.child_name,
          room_name: r.room_name,
          tag_number: r.tag_number,
          allergy_label: r.allergy_label,
          has_restriction: r.has_restriction,
        })),
      });
      // Print only AFTER the database has committed. A printed label with no
      // database row is the worst possible outcome.
      void doPrint(rows[0].pickup_code, rows[0].pickup_token, rows, tagContactName());
    } catch (err) {
      // errorMessage(), not `err instanceof Error`: supabase puts a PLAIN
      // OBJECT in `error`, so the instanceof test was always false and every
      // branch below read "[object Object]".
      const raw = errorMessage(err);

      // A full room is a warning, never a refusal — a church cannot turn a
      // child away at the door. Ask for a one-tap reason and re-send with the
      // override, which the database records against the check-in.
      if (isDbError(err, "room_at_capacity")) {
        // Must dispatch, or the machine stays in `confirming` where every
        // control on the select screen renders enabled and inert.
        dispatch({
          type: "CAPACITY_BLOCKED",
          householdName: ctx.household?.household_name ?? "This family",
        });
        return;
      }

      dispatch({ type: "BLOCKING_ERROR", message: explainCheckInError(raw) });
    } finally {
      setBusy(false);
    }
  };

  const doPrint = async (
    code: string,
    token: string,
    rows: {
      child_name: string;
      room_name: string | null;
      tag_number: number;
      allergy_label: string | null;
      guardian_phone?: string | null;
    }[],
    /**
     * The name for the foot of the tag, resolved by the CALLER rather than read
     * from `droppedOffBy` here. The reprint dialog can be opened for a
     * different family than the one still sitting in this component's state,
     * and a tag naming the wrong adult is worse than one naming nobody.
     */
    contactName?: string | null
  ) => {
    const qr = await renderQrSvg(token);
    const dateLabel = formatSessionDate(session?.session_date);
    // Stamped once, so every label in a family's batch carries the same time.
    const timeLabel = formatClockTime();
    const result = await printLabels(
      rows.map((r) => ({
        childName: r.child_name,
        roomName: r.room_name,
        tagNumber: r.tag_number,
        allergyLabel: r.allergy_label,
        pickupCode: code,
        serviceLabel: session?.service_label ?? "",
        sessionDate: dateLabel,
        checkInTime: timeLabel,
        guardianName: contactName ?? null,
        // The real number, returned by check_in_children specifically for the
        // label. It is deliberately NOT in the search results, which render on
        // screen for every hit — so the full number reaches paper, not the
        // lobby display. Falls back to the masked one if the RPC is older.
        guardianPhone: r.guardian_phone ?? ctx.household?.masked_phone ?? null,
      })),
      {
        householdName: ctx.household?.household_name ?? "",
        childCount: rows.length,
        pickupCode: code,
        qrSvg: qr,
        serviceLabel: session?.service_label ?? "",
        sessionDate: dateLabel,
      }
    );
    setPrintNote(
      result.submitted ? null : "Printer did not respond — write the code on a paper ticket."
    );
  };

  const doCheckoutLookup = async () => {
    if (!session || !ctx.checkoutInput.trim()) return;
    setBusy(true);
    try {
      const matches = await kidsStationService.resolvePickup(
        session.id,
        ctx.checkoutInput.trim()
      );
      dispatch({
        type: "CHECKOUT_RESOLVED",
        matches: matches
          .filter((m) => m.status === "checked_in")
          .map((m) => ({
            check_in_id: m.check_in_id,
            child_name: m.child_name,
            room_name: m.room_name,
            tag_number: m.tag_number,
            allergy_label: null,
            has_restriction: m.has_restriction,
          })),
      });
    } catch (err) {
      // A THROWN error is not a rejected code.
      //
      // resolve_pickup deliberately returns zero ROWS for every code-related
      // denial — wrong, expired, locked, already collected — so the desk cannot
      // be used as an oracle. That generic path is handled by the machine.
      //
      // An exception is a different kind of failure: the operator lacks
      // permission, the schema cache is stale, the network dropped. Reporting
      // those as "not recognised" sent a volunteer hunting for a bad code that
      // was never bad — which is exactly how a pickup code that was born
      // expired stayed hidden for two days.
      dispatch({ type: "ERROR", message: explainCheckoutError(err) });
    } finally {
      setBusy(false);
    }
  };

  const doCheckout = async (override?: { reason: string; verification: string }) => {
    if (ctx.checkoutMatches.length === 0) return;
    // Only the children at this door. Releasing the whole batch would record
    // siblings as collected while they are still sitting in another classroom.
    if (ctx.checkoutSelected.length === 0) {
      dispatch({ type: "ERROR", message: "Tick which children are being collected." });
      return;
    }
    // Naming the collector is what makes the restricted list mean anything:
    // the database can only check a person it has been told about, and it
    // refuses to release a restricted child when nobody is named.
    if (!ctx.collectorName?.trim()) {
      dispatch({ type: "ERROR", message: "Choose who is collecting first." });
      return;
    }
    setBusy(true);
    try {
      const released = await kidsStationService.checkOut({
        checkInIds: ctx.checkoutSelected,
        presented: ctx.checkoutInput.trim(),
        pickedUpByPersonId: ctx.collectorPersonId,
        pickedUpByName: ctx.collectorName?.trim() || null,
        overrideReason: override?.reason ?? null,
        overrideVerification: override?.verification ?? null,
      });
      if (released.length === 0) {
        // One generic denial for every ordinary failure, so the desk cannot be
        // used as an oracle. An override that STILL fails is different: it can
        // only mean a protective order, which no override clears, and the
        // person at the door needs telling plainly.
        dispatch({
          type: "BLOCKING_ERROR",
          message: override
            ? "Still not released. This person is named in a protective order " +
              "for one of these children, and no override can clear that. " +
              "Do not hand them over."
            : "These children were NOT released. Do not hand them over. " +
              "Please get the Kids Ministry lead.",
        });
        return;
      }
      setOverriding(false);
      setOverrideReason("");
      setOverrideCheck("");
      dispatch({ type: "CHECKOUT_DONE" });
    } catch (err) {
      dispatch({
        type: "BLOCKING_ERROR",
        message: isDbError(err, "override_requires_admin")
          ? "Only a Kids Ministry lead can override a pick-up."
          : "These children were NOT released. Do not hand them over. " +
            "Please get the Kids Ministry lead.",
      });
    } finally {
      setBusy(false);
    }
  };

  /**
   * Load who may collect — for EVERY child in the batch, not just the first.
   *
   * Fetching only matches[0] was wrong in both directions: with an unrestricted
   * sibling first, the screen offered a person barred for the OTHER child (and
   * suppressed the warning), and it never offered the grandmother authorised
   * for the restricted child. Checkout is all-or-nothing across the batch, so
   * the desk must be shown the INTERSECTION — only people approved for all of
   * these children.
   */
  useEffect(() => {
    if (ctx.state !== "checkout_confirm" || ctx.checkoutMatches.length === 0) return;
    let cancelled = false;
    const ids = ctx.checkoutMatches.map((m) => m.check_in_id);

    Promise.all(ids.map((id) => kidsStationService.pickupCandidates(id)))
      .then((lists) => {
        if (cancelled) return;
        const [first = [], ...rest] = lists;
        const intersection = first.filter((candidate) =>
          rest.every((list) =>
            list.some((other) => other.person_id === candidate.person_id)
          )
        );
        dispatch({ type: "CHECKOUT_CANDIDATES", candidates: intersection });
      })
      .catch(() => {
        // An empty list is safe: it leaves only "Someone else", which the
        // database refuses for a restricted child. Failing open here would
        // mean guessing, so we do not.
        if (!cancelled) dispatch({ type: "CHECKOUT_CANDIDATES", candidates: [] });
      });

    return () => {
      cancelled = true;
    };
  }, [ctx.state, ctx.checkoutMatches]);

  /* ------------------------------------------------------------- rendering */
  return (
    <div
      className="fixed inset-0 bg-background flex flex-col overflow-hidden"
      onPointerDown={resetIdle}
      onKeyDown={resetIdle}
    >
      <header className="flex items-center justify-between px-6 py-3 border-b shrink-0">
        <div className="flex items-center gap-3">
          <Baby className="h-6 w-6 text-primary" />
          <div>
            <p className="font-semibold leading-tight">ALIC Kids Check-In</p>
            <p className="text-xs text-muted-foreground">
              {session ? session.service_label : "Not started"}
              {profile?.full_name ? ` · ${profile.full_name}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!online && (
            <Badge variant="destructive" className="gap-1">
              <WifiOff className="h-3 w-3" />
              OFFLINE
            </Badge>
          )}
          <Button variant="ghost" size="sm" onClick={() => navigate("/members")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Exit
          </Button>
        </div>
      </header>

      {!online && (
        <div className="bg-destructive text-destructive-foreground px-6 py-2 text-sm font-medium shrink-0">
          No connection. Check-in is unavailable — use the paper backup sheet.
        </div>
      )}

      <main className="flex-1 overflow-y-auto p-6">
        {/* ------------------------------------------------- not started yet */}
        {!session && (
          <Centered title="Start check-in">
            <p className="text-muted-foreground max-w-md">
              Sunday’s session opens on its own 45 minutes before the service,
              so this is usually only needed for another day. It opens today’s
              session and makes every kids classroom available — starting it
              again later never creates a duplicate.
            </p>
            {startError && (
              <p className="text-destructive text-sm mt-4 max-w-md">{startError}</p>
            )}
            <Button size="lg" className="h-16 px-10 text-lg mt-6" onClick={startToday} disabled={starting}>
              {starting ? (
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              ) : (
                <Play className="h-5 w-5 mr-2" />
              )}
              Start check-in for today
            </Button>
          </Centered>
        )}

        {/* --------------------------------------------------------- lookup */}
        {session && !showRooms && (ctx.state === "idle" || ctx.state === "searching") && (
          <div className="max-w-3xl mx-auto">
            {/* The service is over but children are still in rooms. The desk
                used to go completely dark here; now it says which half of the
                job is still available. */}
            {sessionClosed && (
              <div className="mb-4 rounded-lg border-2 border-amber-400 bg-amber-50 p-4">
                <p className="font-semibold flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  This service has ended
                </p>
                <p className="text-sm mt-1">
                  You can still check children out, open a classroom and see the
                  safety card. To check anyone new in, reopen the service from
                  the Kids Ministry page.
                </p>
              </div>
            )}

            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-6 w-6 text-muted-foreground" />
              <Input
                ref={searchInput}
                className="pl-14 h-16 text-xl"
                placeholder={
                  sessionClosed
                    ? "Check-in is closed — you can still check out"
                    : "Phone number or family name"
                }
                value={ctx.query}
                disabled={!online || sessionClosed}
                onChange={(e) => runSearch(e.target.value)}
              />
            </div>

            <div className="mt-4 space-y-2">
              {households.map((h) => (
                <button
                  key={h.household_id}
                  className="w-full text-left rounded-lg border p-4 hover:bg-muted/50"
                  onClick={() => {
                    // New family, new attempt: the previous key must never be
                    // reused, or check_in_children replays the finished batch.
                    attemptKey.current = attemptId();
                    dispatch({ type: "HOUSEHOLD_SELECTED", household: h });
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-medium">{h.household_name}</span>
                    <span className="text-sm text-muted-foreground">{h.masked_phone}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {h.children.length} {h.children.length === 1 ? "child" : "children"}
                  </p>
                </button>
              ))}
              {ctx.state === "searching" && households.length === 0 && (
                <div className="text-center py-8 space-y-3">
                  <p className="text-muted-foreground">
                    No family found. Check the number, or try their name.
                  </p>
                  {/* The dead end this replaces: a visiting family arrived and
                      the desk had nowhere to go. */}
                  <Button size="lg" disabled={!online || sessionClosed} onClick={() => setAddingVisitor(true)}>
                    <UserPlus className="h-4 w-4 mr-1" />
                    They are visiting — add them
                  </Button>
                </div>
              )}
            </div>

            <div className="mt-8 flex justify-center gap-3">
              <Button
                variant="outline"
                size="lg"
                disabled={!online}
                onClick={() => dispatch({ type: "CHECKOUT_STARTED" })}
              >
                Check out a child
              </Button>
              <Button
                variant="outline"
                size="lg"
                disabled={!online || sessionClosed}
                onClick={() => setAddingVisitor(true)}
              >
                <UserPlus className="h-4 w-4 mr-1" />
                Visiting family
              </Button>
              {/* Available on a CLOSED session too: losing the slip is a
                  problem that surfaces at pickup, which is exactly when the
                  service has already ended. */}
              <Button
                variant="outline"
                size="lg"
                disabled={!online}
                onClick={() => setReprinting(true)}
              >
                <Printer className="h-4 w-4 mr-1" />
                Lost slip
              </Button>
              <Button
                variant="outline"
                size="lg"
                disabled={!online}
                onClick={() => setShowRooms(true)}
              >
                <DoorOpen className="h-4 w-4 mr-1" />
                My room
              </Button>
            </div>
          </div>
        )}

        {/* ------------------------------------------- classroom volunteer */}
        {session && showRooms && (
          <StationRoomsPanel
            sessionId={session.id}
            online={online}
            onExit={() => setShowRooms(false)}
          />
        )}

        {/* ------------------------------------------------ select children */}
        {(ctx.state === "selecting" || ctx.state === "confirming") && ctx.household && (
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl font-semibold">{ctx.household.household_name}</h2>
            <p className="text-muted-foreground text-sm mt-1">
              Tap a child to include or exclude them.
            </p>

            {/* Recorded against every check-in, and shown again at the door.
                It answers the one question a volunteer actually asks when
                releasing a child: is this the person who brought them? */}
            {adults.length > 0 && (
              <div className="mt-4 rounded-lg border bg-muted/30 p-3">
                <p className="text-sm font-medium mb-2">Who is dropping off?</p>
                <div className="flex flex-wrap gap-2">
                  {adults.map((a) => {
                    const chosen = droppedOffBy === a.person_id;
                    return (
                      <button
                        key={a.person_id}
                        type="button"
                        onClick={() => setDroppedOffBy(chosen ? null : a.person_id)}
                        className={cn(
                          "rounded-full border-2 px-3 py-1.5 text-sm transition",
                          chosen
                            ? "border-primary bg-primary/10 font-medium"
                            : "border-muted bg-background"
                        )}
                      >
                        {a.display_name}
                        {a.masked_phone && (
                          <span className="text-muted-foreground"> · {a.masked_phone}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {/* Not required. Somebody else can bring a child, and refusing
                    the check-in over it would be worse than not knowing. */}
                {!droppedOffBy && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Someone else? Leave this unset — check-in still works.
                  </p>
                )}
              </div>
            )}

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {ctx.household.children.map((c) => {
                const selected = ctx.selectedChildIds.includes(c.child_person_id);
                const blocked = c.already_checked_in || c.needs_staff;
                return (
                  <button
                    key={c.child_person_id}
                    disabled={blocked}
                    onClick={() => dispatch({ type: "CHILD_TOGGLED", childId: c.child_person_id })}
                    className={`rounded-lg border p-4 text-left transition ${
                      blocked
                        ? "opacity-60 cursor-not-allowed"
                        : selected
                          ? "border-primary bg-primary/5"
                          : ""
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-medium">{c.child_display_name}</span>
                      {selected && !blocked && <CheckCircle2 className="h-5 w-5 text-primary" />}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {/* The GRADE, because that is what places them. Showing
                          the age band here meant a Pre-K child read
                          "Elementary" and was then correctly sent to Joy A,
                          which teaches the volunteer to distrust a correct
                          placement. The band remains the label for a child
                          with no grade — the same child whose placement
                          genuinely does fall back to it. */}
                      {openRooms.length > 0 && selected && (
                        <select
                          className="mt-2 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                          value={ctx.roomOverrides[c.child_person_id] ?? ""}
                          // The tile itself toggles the child; changing the
                          // room must not also deselect them.
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            e.stopPropagation();
                            dispatch({
                              type: "ROOM_OVERRIDDEN",
                              childId: c.child_person_id,
                              roomId: e.target.value,
                            });
                          }}
                        >
                          <option value="">Room by grade</option>
                          {openRooms.map((r) => (
                            <option key={r.room_id} value={r.room_id}>
                              {r.room_name}
                            </option>
                          ))}
                        </select>
                      )}
                      {(c.grade_name ?? c.age_band_code) && (
                        <Badge variant="outline" className="capitalize">
                          {c.grade_name ?? c.age_band_code}
                        </Badge>
                      )}
                      {c.already_checked_in && <Badge variant="secondary">Already checked in</Badge>}
                      {/* Signalled, never explained — a queue of parents can
                          see this screen. */}
                      {c.needs_staff && (
                        <Badge variant="destructive" className="gap-1">
                          <ShieldAlert className="h-3 w-3" />
                          See a volunteer
                        </Badge>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {ctx.error && <p className="mt-4 text-sm text-destructive text-center">{ctx.error}</p>}

            <div className="mt-8 flex gap-3">
              <Button
                variant="outline"
                size="lg"
                className="flex-1"
                onClick={() => {
                  dispatch({ type: "RESET" });
                  setResults([]);
                }}
              >
                Cancel
              </Button>
              <Button
                size="lg"
                className="flex-[2] h-16 text-lg"
                disabled={ctx.selectedChildIds.length === 0 || busy || !online}
                onClick={() => {
                  if (ctx.state === "selecting") {
                    dispatch({ type: "CONFIRM_REQUESTED" });
                    void doCheckIn();
                  }
                }}
              >
                {busy && <Loader2 className="h-5 w-5 mr-2 animate-spin" />}
                Check in {ctx.selectedChildIds.length}{" "}
                {ctx.selectedChildIds.length === 1 ? "child" : "children"}
              </Button>
            </div>
          </div>
        )}

        {/* -------------------------------------------------------- success */}
        {ctx.state === "success" && (
          <Centered title="Checked in">
            <p className="text-sm text-muted-foreground">Pickup code</p>
            {/* Always on screen, large: if the printer is dead the volunteer
                writes it on a paper ticket and keeps moving. */}
            <div className="text-6xl font-mono font-black tracking-[0.3em] my-4">
              {ctx.pickupCode}
            </div>

            <ul className="space-y-1 text-center">
              {ctx.checkedIn.map((c) => (
                <li key={c.check_in_id} className="text-lg">
                  {c.child_name}
                  <span className="text-muted-foreground"> · {c.room_name}</span>
                  {c.allergy_label && (
                    <Badge variant="destructive" className="ml-2">
                      {c.allergy_label}
                    </Badge>
                  )}
                  {/* Not gated on allergy_label: a child on daily medication
                      with a seizure plan has no allergy label at all, and is
                      exactly who this button exists for. */}
                  {(
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-1 h-7"
                      onClick={() => void openSafetyCard(c.check_in_id)}
                    >
                      <HeartPulse className="h-4 w-4" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>

            {printNote && (
              <p className="mt-4 text-amber-700 flex items-center gap-2 text-sm">
                <AlertTriangle className="h-4 w-4" />
                {printNote}
              </p>
            )}

            <div className="flex gap-3 mt-8">
              <Button
                variant="outline"
                size="lg"
                onClick={() => {
                  if (ctx.pickupCode && ctx.pickupToken) {
                    void doPrint(
                      ctx.pickupCode,
                      ctx.pickupToken,
                      ctx.checkedIn.map((c) => ({
                        child_name: c.child_name,
                        room_name: c.room_name,
                        tag_number: c.tag_number,
                        allergy_label: c.allergy_label,
                      })),
                      tagContactName()
                    );
                  }
                }}
              >
                <Printer className="h-4 w-4 mr-1" />
                Print again
              </Button>
              <Button
                size="lg"
                onClick={() => {
                  dispatch({ type: "RESET" });
                  setResults([]);
                  setPrintNote(null);
                }}
              >
                Next family
              </Button>
            </div>
          </Centered>
        )}

        {/* ------------------------------------------------------- checkout */}
        {ctx.state === "checkout_find" && (
          <Centered title="Scan or enter the pickup code">
            <Input
              autoFocus
              className="h-16 text-2xl text-center font-mono tracking-widest max-w-sm"
              placeholder="ABC-123"
              value={ctx.checkoutInput}
              onChange={(e) => dispatch({ type: "CHECKOUT_INPUT", value: e.target.value })}
              onKeyDown={(e) => {
                // A barcode scanner types the code then presses Enter, so one
                // field serves both scanning and typing by hand.
                if (e.key === "Enter") void doCheckoutLookup();
              }}
            />
            {ctx.error && <p className="mt-3 text-destructive text-sm">{ctx.error}</p>}
            <div className="flex gap-3 mt-6">
              <Button variant="outline" size="lg" onClick={() => dispatch({ type: "RESET" })}>
                Cancel
              </Button>
              <Button size="lg" onClick={doCheckoutLookup} disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Find
              </Button>
            </div>
          </Centered>
        )}

        {ctx.state === "checkout_confirm" && (
          <div className="max-w-2xl mx-auto">
            <h2 className="text-2xl font-semibold text-center">
              Who is collecting?
            </h2>

            {/* Siblings are routinely split across classrooms, so the parent
                works round the building with one code. Tick only the children
                actually standing at THIS door — the rest keep the code alive
                and stay on their room's roster. */}
            <ul className="my-5 space-y-2">
              {ctx.checkoutMatches.map((m) => {
                const picked = ctx.checkoutSelected.includes(m.check_in_id);
                return (
                  <li key={m.check_in_id}>
                    <button
                      type="button"
                      onClick={() =>
                        dispatch({ type: "TOGGLE_CHECKOUT_CHILD", checkInId: m.check_in_id })
                      }
                      aria-pressed={picked}
                      className={cn(
                        "w-full flex items-center gap-3 rounded-lg border-2 p-3 text-left transition",
                        picked ? "border-primary bg-primary/5" : "border-muted opacity-60"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded border-2",
                          picked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground"
                        )}
                      >
                        {picked && <CheckCircle2 className="h-4 w-4" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xl font-medium truncate">
                          {m.child_name}
                        </span>
                        <span className="block text-sm text-muted-foreground">
                          {m.room_name ?? "No room"} · Tag {m.tag_number}
                        </span>
                      </span>
                      {m.has_restriction && (
                        <ShieldAlert className="h-5 w-5 shrink-0 text-destructive" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>

            {ctx.checkoutSelected.length < ctx.checkoutMatches.length && (
              <p className="mb-4 text-center text-sm text-muted-foreground">
                {ctx.checkoutMatches.length - ctx.checkoutSelected.length} staying
                in class. This code keeps working until everyone is collected.
              </p>
            )}

            {/* A restriction on file is the reason this screen exists, so it
                is stated plainly — without naming the restricted person, who
                may well be standing at the desk. */}
            {/* Driven off checkoutMatches, not the candidate list. The
                candidates are fetched for the FIRST match only, so a sibling
                batch whose restricted child did not sort first suppressed the
                warning entirely — whether a custody order reached the desk
                was a coin flip on tag number. */}
            {(ctx.checkoutMatches.some((m) => m.has_restriction) ||
              ctx.pickupCandidates.some((c) => c.child_has_restriction)) && (
              <div className="mb-4 rounded-lg border-2 border-destructive bg-destructive/10 p-4">
                <p className="font-semibold flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-destructive" />
                  Check this person's ID carefully
                </p>
                <p className="text-sm mt-1">
                  There is a pickup restriction on file for this family. If the
                  person collecting is not listed below, do not release the
                  children — get the Kids Ministry lead.
                </p>
              </div>
            )}

            <div className="space-y-2">
              {ctx.pickupCandidates.map((candidate) => {
                const chosen = ctx.collectorPersonId === candidate.person_id;
                return (
                  <button
                    key={candidate.person_id}
                    className={
                      "w-full rounded-lg border p-4 text-left transition-colors " +
                      (chosen
                        ? "border-primary bg-primary/10"
                        : "hover:bg-muted/50")
                    }
                    onClick={() => {
                      dispatch({
                        type: "COLLECTOR_SELECTED",
                        personId: candidate.person_id,
                        name: candidate.display_name,
                      });
                    }}
                  >
                    <span className="text-lg font-medium">
                      {candidate.display_name}
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      {candidate.relationship}
                      {candidate.is_authorized && " · authorised for pickup"}
                    </span>
                  </button>
                );
              })}

              {/* Anyone not on the list. For an ordinary child this is a
                  recorded name; for a restricted child the database refuses,
                  which is exactly the escalation wanted. */}
              <div
                className={
                  "rounded-lg border p-4 " +
                  (ctx.collectorPersonId === null && ctx.collectorName
                    ? "border-primary bg-primary/10"
                    : "")
                }
              >
                <label className="text-sm font-medium">
                  Someone else — write their name
                </label>
                <Input
                  className="mt-2 h-12 text-lg"
                  placeholder="Name of the person collecting"
                  value={ctx.collectorPersonId === null ? ctx.collectorName ?? "" : ""}
                  onChange={(e) => {
                    dispatch({
                      type: "COLLECTOR_SELECTED",
                      personId: null,
                      // NOT trimmed here: trimming each keystroke ate the
                      // space, so "John Smith" could only ever be "JohnSmith".
                      name: e.target.value || null,
                    });
                  }}
                />
              </div>
            </div>

            {ctx.error && (
              <p className="text-destructive text-sm mt-3">{ctx.error}</p>
            )}

            <div className="flex gap-3 mt-6">
              <Button
                variant="outline"
                size="lg"
                onClick={() => dispatch({ type: "RESET" })}
              >
                Cancel
              </Button>
              <Button
                size="lg"
                className="flex-1"
                onClick={() => void doCheckout()}
                disabled={busy || !ctx.collectorName?.trim()}
              >
                {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Release to {ctx.collectorName || "\u2026"}
              </Button>
            </div>
          </div>
        )}

        {ctx.state === "checkout_done" && (() => {
          const staying = ctx.checkoutMatches.filter(
            (m) => !ctx.checkoutSelected.includes(m.check_in_id)
          );
          return (
            <Centered title="Released">
              <CheckCircle2 className="h-16 w-16 text-green-600" />

              {/* The parent is about to walk away. If siblings are still in
                  other rooms, the one thing they must not do is throw the slip
                  away — it is the only thing that releases the others. */}
              {staying.length > 0 && (
                <div className="mt-6 w-full max-w-md rounded-lg border-2 border-amber-400 bg-amber-50 p-4 text-left">
                  <p className="font-semibold">
                    Keep the pickup slip — {staying.length}{" "}
                    {staying.length === 1 ? "child is" : "children are"} still in class
                  </p>
                  <ul className="mt-2 space-y-0.5 text-sm">
                    {staying.map((m) => (
                      <li key={m.check_in_id}>
                        {m.child_name} · {m.room_name ?? "No room"}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-sm text-muted-foreground">
                    The same code works at their classroom door.
                  </p>
                </div>
              )}

              <Button size="lg" className="mt-6" onClick={() => dispatch({ type: "RESET" })}>
                Done
              </Button>
            </Centered>
          );
        })()}
      </main>

      {/* ------------------------------------------- room full: warn, allow */}
      {/* The plan is explicit: capacity is an amber warning, never a hard
          block. A church cannot turn a child away at the door, so the only
          question is whether the breach gets recorded — and it does. */}
      <Dialog
        open={ctx.capacityBlocked !== null}
        onOpenChange={(open) => !open && dispatch({ type: "DISMISS_CAPACITY" })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              That room is full
            </DialogTitle>
            <DialogDescription>
              The classroom is at capacity. You can still check {ctx.capacityBlocked}{" "}
              in — the room will show an over-capacity warning on the Kids
              Ministry board so a leader can move a volunteer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="lg"
              onClick={() => dispatch({ type: "DISMISS_CAPACITY" })}
            >
              Not now
            </Button>
            <Button
              size="lg"
              disabled={busy}
              onClick={() => {
                // Back into `confirming` first: CHECKED_IN used to be guarded
                // on that state while CAPACITY_BLOCKED had moved us to
                // `selecting`, so the commit succeeded, the label printed, and
                // the screen never advanced — the volunteer's obvious second
                // tap then rotated the code on the label already in the
                // parent's hand.
                dispatch({ type: "DISMISS_CAPACITY" });
                dispatch({ type: "CONFIRM_REQUESTED" });
                void doCheckIn(true, "Room at capacity — checked in anyway at the desk");
              }}
            >
              {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Check in anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------ failure the volunteer must see */}
      {/* A toast is wrong here: it fades while a volunteer is looking at a
          parent, and the one thing they must not do is hand over a label for
          a check-in that never committed. */}
      <Dialog
        open={ctx.blockingError !== null}
        onOpenChange={(open) => !open && dispatch({ type: "DISMISS_BLOCKING" })}
      >
        <DialogContent className="border-destructive border-2">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Stop
            </DialogTitle>
            <DialogDescription className="text-base text-foreground">
              {ctx.blockingError}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              size="lg"
              variant={
                canOverride && ctx.state === "checkout_confirm"
                  ? "outline"
                  : "default"
              }
              className="flex-1"
              onClick={() => dispatch({ type: "DISMISS_BLOCKING" })}
            >
              I understand
            </Button>
            {/* A lead can release a child the gate refused — for incomplete
                paperwork, which is the common cause. It can never release to
                somebody named in a protective order: that is checked before
                the override branch and has no override by design. */}
            {canOverride && ctx.state === "checkout_confirm" && (
              <Button
                size="lg"
                variant="destructive"
                className="flex-1"
                onClick={() => {
                  dispatch({ type: "DISMISS_BLOCKING" });
                  setOverriding(true);
                }}
              >
                Release anyway
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------ lead override on pickup */}
      <Dialog
        open={overriding}
        onOpenChange={(open) => {
          if (!open) {
            setOverriding(false);
            setOverrideReason("");
            setOverrideCheck("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-destructive" />
              Release without a valid code
            </DialogTitle>
            <DialogDescription>
              Releasing{" "}
              {ctx.checkoutMatches
                .filter((m) => ctx.checkoutSelected.includes(m.check_in_id))
                .map((m) => m.child_name)
                .join(", ")} to{" "}
              <strong>{ctx.collectorName}</strong>. This is recorded against
              your name and appears on the Kids Ministry exceptions report.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Why is the code not being used?</Label>
              <Input
                autoFocus
                className="h-12 text-base"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Label lost; parent phoned ahead"
              />
            </div>
            <div className="space-y-2">
              <Label>How did you check who they are?</Label>
              <Input
                className="h-12 text-base"
                value={overrideCheck}
                onChange={(e) => setOverrideCheck(e.target.value)}
                placeholder="Driver's licence, recognised by the room lead"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="lg"
              onClick={() => {
                setOverriding(false);
                setOverrideReason("");
                setOverrideCheck("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="lg"
              className="flex-1"
              disabled={busy || !overrideReason.trim() || !overrideCheck.trim()}
              onClick={() =>
                void doCheckout({
                  reason: overrideReason.trim(),
                  verification: overrideCheck.trim(),
                })
              }
            >
              {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Release
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --------------------------------------------- KID-018 safety card */}
      {/* Opening this writes an audit row server-side, every time. */}
      <Dialog
        open={safety !== null || safetyFor !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSafety(null);
            setSafetyFor(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{safety?.child_name ?? "Safety card"}</DialogTitle>
            <DialogDescription>
              Opening this is recorded against your name.
            </DialogDescription>
          </DialogHeader>
          {safety ? (
            <div className="space-y-3">
              <dl className="space-y-3 text-sm">
                <SafetyRow label="Allergies" value={safety.allergies} highlight />
                <SafetyRow label="Severity" value={safety.allergy_severity} />
                <SafetyRow label="Medications" value={safety.medications} />
                <SafetyRow label="Special needs" value={safety.special_needs} />
              </dl>

              {/* Parents first. The people you ring about a child are their
                  parents; a recorded "emergency contact" is who to try when
                  they cannot be reached. Tappable, because this screen is
                  read on a tablet by someone holding a child. */}
              <div className="space-y-2 border-t pt-3">
                <p className="text-sm font-medium">Who to call</p>
                {(safety.contacts ?? []).length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Nobody with a phone number on file.
                  </p>
                )}
                {(safety.contacts ?? []).map((c, i) => (
                  <a
                    key={`${c.name}-${i}`}
                    href={c.phone ? `tel:${c.phone}` : undefined}
                    className="flex items-center gap-3 rounded-md border p-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.relationship}
                      </p>
                    </div>
                    <span className="font-semibold tabular-nums shrink-0">
                      {c.phone}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* The New Family desk. Registering hands straight over to the normal
          check-in flow — the family is in the directory now, so nothing about
          the rest of the morning is special-cased. */}
      {/* Reprinting ROTATES the code, so the label that comes out is the only
          one that now works. Printed here rather than inside the dialog, so it
          goes through the same path as every other label. */}
      <ReprintLabelDialog
        open={reprinting}
        onOpenChange={setReprinting}
        sessionId={session?.id ?? null}
        onReprinted={async (rows) => {
          setReprinting(false);
          if (rows.length === 0) return;
          await doPrint(
            rows[0].pickup_code,
            rows[0].pickup_token,
            rows.map((r) => ({
              child_name: r.child_name,
              room_name: r.room_name,
              tag_number: r.tag_number,
              allergy_label: r.allergy_label,
              guardian_phone: r.guardian_phone,
            })),
            // The batch's own household, not this component's state: a reprint
            // can be for a family it never checked in.
            rows[0].household_name
          );
        }}
      />

      <VisitorFamilyDialog
        open={addingVisitor}
        onOpenChange={setAddingVisitor}
        initialQuery={ctx.query}
        onRegistered={(rows) => {
          setAddingVisitor(false);
          if (rows.length === 0) return;
          // A fresh attempt key: reusing the previous one makes
          // check_in_children replay a finished batch.
          attemptKey.current = attemptId();
          dispatch({
            type: "HOUSEHOLD_SELECTED",
            household: {
              household_id: rows[0].household_id,
              household_name: rows[0].household_name,
              masked_phone: null,
              children: rows.map((r) => ({
                child_person_id: r.child_person_id,
                child_display_name: r.child_display_name,
                // A visiting child has no school grade on file, so placement
                // falls back to the age band derived from their birth year.
                age_band_code: null,
                grade_name: null,
                already_checked_in: false,
                needs_staff: false,
              })),
            },
          });
        }}
      />
    </div>
  );
}

/** One line of the safety card. Nothing on file is said so, not left blank. */
function SafetyRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | null | undefined;
  highlight?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <dt className="w-36 shrink-0 text-muted-foreground">{label}</dt>
      <dd className={highlight && value ? "font-semibold" : undefined}>
        {value || <span className="text-muted-foreground">Nothing on file</span>}
      </dd>
    </div>
  );
}

function Centered({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center">
      <h2 className="text-2xl font-semibold mb-4">{title}</h2>
      {children}

    </div>
  );
}
