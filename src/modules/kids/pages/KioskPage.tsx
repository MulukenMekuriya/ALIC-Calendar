/**
 * The lobby kiosk. A parent uses this alone.
 *
 * A SEPARATE ROUTE FROM /checkin, NOT A BRANCH INSIDE IT. CheckInStationPage
 * is 1800 lines shaped around a staffed desk, and branching inside it would
 * put a parent-facing screen one `&&` away from a child's safety card. A
 * separate page means a staff control cannot render here BY CONSTRUCTION —
 * and it means the Sunday path for the existing volunteers is not touched at
 * all, which is the single biggest risk in this work.
 *
 * ABSENT BY CONSTRUCTION, not by a hidden button: check-out, My room, the
 * safety card, Still-here, transfer, parent message, capacity override,
 * pick-up override. The database agrees — resolve_actor gives a kiosk
 * can_check_out = false, so check_out_children refuses it outright.
 *
 * A PARENT MAY CHOOSE THE CLASSROOM, and that is not an exception to the line
 * above. Choosing between the rooms that are open for their own child is what
 * they would ask a volunteer for anyway — siblings together, or a grade that is
 * wrong or missing on file, which it is for 415 of 534 children. Overriding a
 * FULL room is the staff power, and the kiosk does not have it: a full
 * classroom is listed as full and cannot be picked, because can_override is
 * false in the database and no copy on this screen can talk it into being true.
 *
 * IT IS THE DESK'S DROPDOWN, not a kiosk-only screen. CheckInStationPage has
 * had a room select on each child's tile since 20260320002500, and a parent
 * being helped by a volunteer should not be looking at a different idiom from
 * the one that volunteer uses every Sunday. A native select also hands the
 * tablet's own picker the job of being large, scrollable and reachable, which
 * is the part a custom list gets wrong first.
 *
 * TWO OF THE DESK'S DIALOGS, AND NO OTHERS. A family who has never been here,
 * and a parent who has lost the slip, are the two reasons a volunteer gets
 * called over to a kiosk that is otherwise doing its job — so the desk's own
 * VisitorFamilyDialog and ReprintLabelDialog are offered from the welcome
 * screen, unchanged. Same form, same functions, same audit rows; the parent
 * types what a volunteer would have typed for them. They sit under Start as a
 * pair of quieter buttons rather than beside it, so the one thing most
 * families came to do keeps the whole screen's weight, and the exceptions are
 * found by the families who need them without being mistaken for the rule.
 *
 * TWO THINGS THE DESK NEVER HAD TO THINK ABOUT. The dialogs are MOUNTED ONLY
 * WHILE OPEN, so a half-typed family is gone from memory the moment the form
 * closes, rather than waiting behind a shut dialog for the next parent to
 * reopen it. And an open dialog counts as a family on screen: the inactivity
 * wipe runs under it and closes it, exactly as it clears a list of children.
 *
 * A TRADE-OFF, STATED RATHER THAN HIDDEN. ReprintLabelDialog finds a family
 * by name or phone from three characters — the desk's idiom, and wider than
 * the ten-digit rule the kiosk's own search keeps. What it can show is a
 * household name, a masked phone and the first names of children still in a
 * room; what it can do is rotate that family's code. The control that
 * actually releases a child is the teacher at the door matching the adult
 * against the approved list, and that is untouched. If the ministry wants
 * the lobby held to the ten-digit rule here too, that is a phone-only door
 * in the database, not a change to this screen.
 *
 * AND NO SIDEBAR. Rendered outside DashboardLayout deliberately: a parent
 * holding a lobby tablet must not be able to navigate into the church's
 * admin. That is a child-safety property, not a layout preference.
 *
 * THE DESIGN RULE FOR EVERY ERROR STATE HERE: the kiosk never leaves a family
 * with a dead end. There is no volunteer behind it to fill the gap, so every
 * message names the next thing to do, and where the screen can do nothing it
 * says "see a Kids Ministry volunteer" in large type and stops.
 *
 * ACCESSIBILITY. This is a public-facing device, which puts it in a different
 * class from the staff screens: touch targets are at least 44px with real
 * spacing, every control is a real <button> reachable by keyboard, nothing
 * depends on hover, meaning is never carried by colour alone, and the busy
 * and result states are announced through a live region for a screen reader.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppBusy } from "@/shared/hooks/useBuildWatcher";
import { Button } from "@/shared/components/ui/button";
import { Loader2, Delete, WifiOff, UserPlus, Printer } from "lucide-react";
import { getLogoSrc } from "@/shared/constants/branding";
import {
  kioskService,
  type KioskBootstrap,
  type KioskChild,
  type KioskRoom,
} from "../services/kioskService";
import { kidsStationService } from "../services/kidsStationService";
import { VisitorFamilyDialog } from "../components/VisitorFamilyDialog";
import { ReprintLabelDialog } from "../components/ReprintLabelDialog";
import { kioskStrings as S } from "../utils/kioskStrings";
import {
  STATION_STORAGE_KEY,
  type ReprintedLabelRow,
  type VisitorFamilyRow,
} from "../types";
import { errorMessage, isDbError } from "../services/rpcError";
import { printLabels, renderQrSvg } from "../services/labelPrintService";
import { formatSessionDate, formatClockTime } from "../utils/sessionDate";
import {
  appendDigit,
  removeDigit,
  isSearchable,
  formatPhone,
} from "../utils/kioskPhone";

type Step = "idle" | "phone" | "children" | "done";

/** The code stays up long enough to be written down. */
const DONE_RESET_MS = 30_000;
/** A family who walks away mid-flow must not leave their children on screen. */
const IDLE_WIPE_MS = 45_000;

export default function KioskPage() {
  const [step, setStep] = useState<Step>("idle");
  const [boot, setBoot] = useState<KioskBootstrap | null>(null);
  const [stationId, setStationId] = useState<string | null>(null);
  const [digits, setDigits] = useState("");
  const [children, setChildren] = useState<KioskChild[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [rooms, setRooms] = useState<KioskRoom[]>([]);
  /**
   * child id -> room id, only for the children whose parent actually chose.
   *
   * EMPTY IS THE COMMON CASE, and it means "place them the way you would have
   * anyway" — a null goes to the database, not the suggestion, so two rooms
   * sharing a grade keep self-balancing over a morning.
   */
  const [roomChoice, setRoomChoice] = useState<Record<string, string>>({});
  /** Where each child actually ended up, for the last screen. */
  const [placed, setPlaced] = useState<{ name: string; room: string | null }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [printFailed, setPrintFailed] = useState(false);
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  /**
   * The desk's two dialogs, mounted only while open — see the file header.
   * Opened from the welcome screen, and the visitor one again from the
   * keypad's "not found", which is the moment a visiting family discovers
   * they are one.
   */
  const [addingVisitor, setAddingVisitor] = useState(false);
  const [reprinting, setReprinting] = useState(false);
  /** The last screen serves a fresh check-in and a replaced slip alike. */
  const [doneKind, setDoneKind] = useState<"checkin" | "reprint">("checkin");

  // Anything but the idle screen has a family on it — a phone number, a list
  // of children, or a pick-up code somebody is waiting to be given — and so
  // does an open dialog, where a parent is typing their family's names. The
  // build watcher will not reload under any of that, and the inactivity wipe
  // below runs under all of it.
  const engaged = step !== "idle" || addingVisitor || reprinting;
  useAppBusy(engaged);

  // --- the device ----------------------------------------------------------
  useEffect(() => {
    try {
      setStationId(localStorage.getItem(STATION_STORAGE_KEY));
    } catch {
      // Private browsing, cleared site data: the kiosk still works, it just
      // cannot name itself in the audit trail.
      setStationId(null);
    }
  }, []);

  const loadBoot = useCallback(async () => {
    try {
      setBoot(await kioskService.bootstrap(stationId));
    } catch (err) {
      console.error("kiosk bootstrap failed", err);
      setBoot(null);
    }
  }, [stationId]);

  useEffect(() => {
    void loadBoot();
    // Re-read every few minutes so a session opened after the tablet was
    // switched on is picked up without anybody touching it.
    const t = window.setInterval(() => void loadBoot(), 120_000);
    return () => window.clearInterval(t);
  }, [loadBoot]);

  // The classrooms, as soon as a session is open and again with every
  // bootstrap, so "Full" is not ten minutes stale. It also reconciles the
  // session's rooms — the same thing the staffed desk does when it lists them,
  // because it IS the thing the staffed desk does — which is what stops a
  // parent being offered an empty list and then refused.
  //
  // A FAILURE HERE IS NOT FATAL: rooms stays empty, the chooser is not
  // rendered, and the kiosk behaves exactly as it did before it could choose.
  useEffect(() => {
    if (!boot || boot.status !== "open") {
      setRooms([]);
      return;
    }
    let cancelled = false;
    void kioskService
      .sessionRooms(boot.kids_session_id)
      .then((r) => {
        if (!cancelled) setRooms(r);
      })
      .catch((err) => console.error("kiosk classroom list failed", err));
    return () => {
      cancelled = true;
    };
  }, [boot]);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  // --- wiping --------------------------------------------------------------
  const wipe = useCallback(() => {
    setStep("idle");
    setDigits("");
    setChildren([]);
    setSelected([]);
    setRoomChoice({});
    setPlaced([]);
    setError(null);
    setCode(null);
    setPrintFailed(false);
    setDoneKind("checkin");
    // Closing them UNMOUNTS them, which is what empties a half-typed form.
    setAddingVisitor(false);
    setReprinting(false);
  }, []);

  useEffect(() => {
    // Everything except the idle screen is wiped after inactivity. On a shared
    // lobby device the next parent must never see the previous family's
    // children, and the pick-up code must never be left up for a stranger.
    //
    // INACTIVITY MEANS NO TOUCH, not "no change of screen". This used to
    // re-arm only when the step, the digits or the list of children changed,
    // so a parent choosing classrooms for three children — or, now, typing a
    // visiting family into a form — was wiped mid-task at 45 seconds for the
    // crime of being careful. Any press or key re-arms it; the clock only
    // runs while nobody is there.
    if (!engaged) return;
    const ms = step === "done" ? DONE_RESET_MS : IDLE_WIPE_MS;
    let t = window.setTimeout(wipe, ms);
    const touched = () => {
      window.clearTimeout(t);
      t = window.setTimeout(wipe, ms);
    };
    // Native listeners on window, so a dialog rendered into a portal counts.
    window.addEventListener("pointerdown", touched);
    window.addEventListener("keydown", touched);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("pointerdown", touched);
      window.removeEventListener("keydown", touched);
    };
  }, [engaged, step, wipe]);

  // --- actions -------------------------------------------------------------
  const sessionOpen = boot?.status === "open";

  async function find() {
    if (!boot) return;
    setBusy(true);
    setError(null);
    try {
      const rows = await kioskService.findByPhone(
        boot.kids_session_id,
        digits,
        stationId,
      );
      if (rows.length === 0) {
        setError(S.notFound);
        return;
      }
      setChildren(rows);
      setSelected(rows.filter((r) => !r.already_checked_in).map((r) => r.child_person_id));
      // Cleared here as well as in wipe(). These are keyed by child id, and a
      // choice left over from a previous search must not be able to travel
      // into a different family's batch.
      setRoomChoice({});
      setStep("children");
    } catch (err) {
      if (isDbError(err, "too_many_attempts")) setError(S.tooManyTries);
      else if (isDbError(err, "phone_must_be_ten_digits")) setError(S.needTenDigits);
      else if (isDbError(err, "station_not_active")) setError(S.deviceUnknownBody);
      else setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  /**
   * The parent moved one child's classroom. An empty value is "" — the first
   * option — and it DELETES the entry rather than storing a blank, so the
   * check-in sends a null and placement is decided by grade exactly as it is
   * for a family who never touched the control.
   *
   * Deliberately NOT remembered for next Sunday. The desk's
   * kids_set_child_room_preference records a volunteer's considered decision
   * and then carries it up a grade every school year by itself; a tap in a
   * lobby is a different kind of act and must not become a standing placement
   * behind the family's back.
   */
  function chooseRoom(childPersonId: string, roomId: string) {
    setError(null);
    setRoomChoice((prev) => {
      const next = { ...prev };
      if (roomId) next[childPersonId] = roomId;
      else delete next[childPersonId];
      return next;
    });
  }

  /**
   * One family's labels — the child tags and the parent slip — for a fresh
   * check-in and for a replaced slip alike. A reprint goes through exactly the
   * path a check-in does, so the two cannot drift on what a label says.
   */
  async function printSlip(
    rows: {
      child_name: string;
      room_name: string | null;
      tag_number: number;
      allergy_label: string | null;
      guardian_phone?: string | null;
      pickup_code: string;
      pickup_token: string;
    }[],
    householdName: string,
  ) {
    if (rows.length === 0) return;
    const serviceLabel = boot?.session_label ?? "";
    const sessionDate = boot ? formatSessionDate(boot.session_date) : "";
    const qr = await renderQrSvg(rows[0].pickup_token);
    const result = await printLabels(
      rows.map((r) => ({
        childName: r.child_name,
        roomName: r.room_name,
        tagNumber: r.tag_number,
        allergyLabel: r.allergy_label,
        pickupCode: rows[0].pickup_code,
        serviceLabel,
        sessionDate,
        // At check-in this is the check-in time; on a reprint, the reprint's.
        checkInTime: formatClockTime(),
        guardianName: null,
        guardianPhone: r.guardian_phone ?? null,
      })),
      {
        householdName,
        childCount: rows.length,
        pickupCode: rows[0].pickup_code,
        qrSvg: qr,
        // Both required, and both were once missing. buildParentLabel renders
        // them on the slip the parent walks away with; esc(undefined) is "",
        // so it printed a blank line rather than failing, and the one piece
        // of paper that says WHICH service a child was left at said nothing
        // at all. The child labels had them the whole time.
        serviceLabel,
        sessionDate,
      },
    );
    // `submitted`, not `ok` — there is no `ok`. This read `!result.ok`,
    // which is `!undefined`, which is always true, so every parent who
    // checked a child in was told the printer had failed and to find a
    // volunteer. On the one screen whose entire purpose is that they do not
    // have to. The staffed desk has always read `submitted`.
    //
    // `submitted` means the job reached the OS spooler, not that paper came
    // out — which is why the code stays on screen either way.
    if (!result.submitted) setPrintFailed(true);
  }

  /**
   * A visiting family has just been registered — by the parent, on the same
   * form a volunteer uses at the desk. They are in the directory now, so the
   * rest of the morning is the ordinary path: their children are listed as
   * any family's are, all of them selected, and the next tap checks them in.
   * Nothing downstream knows they are new.
   */
  function visitorRegistered(rows: VisitorFamilyRow[]) {
    setAddingVisitor(false);
    if (rows.length === 0) return;
    setChildren(
      rows.map((r) => ({
        household_id: r.household_id,
        household_name: r.household_name,
        child_person_id: r.child_person_id,
        child_name: r.child_display_name,
        photo_path: null,
        // The form may have stored a grade from the birth year, but this row
        // does not carry its name, and placement reads the record anyway.
        grade_name: null,
        already_checked_in: false,
      })),
    );
    setSelected(rows.map((r) => r.child_person_id));
    setRoomChoice({});
    setError(null);
    setStep("children");
  }

  /**
   * A lost slip has been replaced. The rows carry the ROTATED code, so the old
   * slip is already dead; what the parent needs now is the new code on paper
   * and on screen, and the classroom to walk to — which is the done screen.
   */
  async function slipReprinted(rows: ReprintedLabelRow[]) {
    setReprinting(false);
    if (rows.length === 0) return;
    setCode(rows[0].pickup_code);
    setPlaced(rows.map((r) => ({ name: r.child_name, room: r.room_name })));
    setDoneKind("reprint");
    setStep("done");
    await printSlip(rows, rows[0].household_name);
  }

  async function checkIn() {
    if (!boot || selected.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      // Belt and braces. The search returns one row per child now, but a
      // duplicate id reaching check_in_children means the batch violates
      // uq_kids_check_ins_one_active_per_session and the WHOLE family is
      // refused - in front of a parent, in a lobby. Cheap to make impossible.
      const childIds = [...new Set(selected)];

      const rows = await kidsStationService.checkIn({
        sessionId: boot.kids_session_id,
        childIds,
        clientBatchKey: `kiosk:${boot.kids_session_id}:${childIds.slice().sort().join(",")}`,
        // POSITIONAL against childIds, and mapped over that same array so the
        // two cannot drift — a misaligned pair here would put one sibling in
        // another's classroom silently, which is the worst thing this screen
        // could do. A null means "decide by grade", which is what every child
        // sent before this screen could choose, and what most still send.
        roomIds: childIds.map((id) => roomChoice[id] ?? null),
      });

      const accepted = rows.filter((r) => !r.refused);
      if (accepted.length === 0) {
        // Everything was refused. The database's own words, because "try
        // again" would be a lie — trying again does exactly the same thing.
        setError(rows[0]?.refusal_message ?? S.noSession);
        return;
      }

      setCode(accepted[0].pickup_code);
      // From the database's rows, never from what the screen chose: the room a
      // child is actually in is the one the batch recorded, and the last screen
      // is a parent's directions to it.
      //
      // ACCEPTED ONLY, and that is not the whole story: a PARTLY refused batch
      // still shows this screen and says nothing about the child who was
      // refused. Pre-existing — the branch above only speaks when EVERY child
      // was refused — and left alone here because a refusal needs its own words
      // rather than an omission from a list of classrooms. It starts to matter
      // when consent begins blocking on 1 November.
      setPlaced(accepted.map((r) => ({ name: r.child_name, room: r.room_name })));
      setDoneKind("checkin");
      setStep("done");

      // Print only AFTER the database has committed. A printed label with no
      // row behind it is the worst possible outcome.
      await printSlip(accepted, children[0]?.household_name ?? "");
    } catch (err) {
      // A CLASSROOM REFUSAL IS A RAISE, NOT A ROW. check_in_one_child raises
      // room_at_capacity and room_not_open, which rolls the whole batch back —
      // so nothing was written, the family is exactly where they were, and the
      // right next move is a different classroom rather than "try again".
      //
      // Reachable before this screen existed too: pick_room_for_child does not
      // consider capacity, so a full grade room raised room_at_capacity and the
      // kiosk printed the raw identifier at a parent. Now there is something
      // they can do about it, so the message says what.
      if (isDbError(err, "room_at_capacity")) setError(S.classroomFull);
      else if (isDbError(err, "room_not_open")) setError(S.classroomClosed);
      else if (isDbError(err, "no_open_classroom")) setError(S.noClassroom);
      else setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const announce = useMemo(() => {
    if (busy) return S.searching;
    if (error) return error;
    if (step === "done" && code) {
      const title = doneKind === "reprint" ? S.newSlipTitle : S.allDone;
      return `${title}. ${S.yourCode} ${code}`;
    }
    return "";
  }, [busy, error, step, code, doneKind]);

  // --- the screens ---------------------------------------------------------

  /**
   * Offline comes first and replaces everything. A self-service device that
   * cannot reach the database has nothing useful left to offer, and it cannot
   * tell a parent to fill in a paper sheet it does not have.
   */
  if (!online) {
    return (
      <Shell>
        <div className="text-center max-w-xl" role="alert">
          <WifiOff className="h-16 w-16 mx-auto mb-6 text-muted-foreground" aria-hidden />
          <h1 className="text-4xl font-bold mb-4">{S.offlineTitle}</h1>
          <p className="text-xl text-muted-foreground">{S.offlineBody}</p>
        </div>
      </Shell>
    );
  }

  if (boot && !boot.station_known) {
    return (
      <Shell>
        <div className="text-center max-w-xl" role="alert">
          <h1 className="text-4xl font-bold mb-4">{S.deviceUnknownTitle}</h1>
          <p className="text-xl text-muted-foreground">{S.deviceUnknownBody}</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {/* Announced to a screen reader without moving focus, so a parent using
          VoiceOver hears the result rather than discovering it by exploring. */}
      <div aria-live="polite" className="sr-only">
        {announce}
      </div>

      {step === "idle" && (
        <div className="text-center">
          <h1 className="text-5xl font-bold mb-3">{S.welcome}</h1>
          <p className="text-2xl text-muted-foreground mb-10">{S.welcomeSub}</p>
          <Button
            size="lg"
            className="h-20 px-16 text-2xl"
            disabled={!sessionOpen}
            onClick={() => setStep("phone")}
          >
            {S.begin}
          </Button>
          {!sessionOpen && (
            <p className="mt-6 text-lg text-muted-foreground max-w-md mx-auto">
              {S.noSession}
            </p>
          )}

          {/* THE TWO EXCEPTIONS, UNDER THE RULE. The same two dialogs the
              staffed desk keeps in its button row, in a parent's words. They
              sit below Start rather than beside it, outlined rather than
              filled and a size down, so the one thing most families came to
              do keeps the whole screen's weight — and far enough below it
              that a thumb aimed at Start cannot land here. Still 56px tall:
              these are the families who are already flustered.

              "Lost your slip?" is never closed by the session, because a slip
              goes missing at pick-up, which is exactly when the service has
              already ended. "First time here?" follows Start: registering is
              only the first half of checking in. */}
          <div className="mt-12 flex flex-wrap justify-center gap-4">
            <Button
              variant="outline"
              size="lg"
              className="h-14 px-8 text-lg [&_svg]:size-5"
              disabled={!sessionOpen}
              onClick={() => setAddingVisitor(true)}
            >
              <UserPlus aria-hidden />
              {S.visiting}
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="h-14 px-8 text-lg [&_svg]:size-5"
              onClick={() => setReprinting(true)}
            >
              <Printer aria-hidden />
              {S.lostSlip}
            </Button>
          </div>

          {boot?.station_name && (
            <p className="mt-10 text-sm text-muted-foreground">{boot.station_name}</p>
          )}
        </div>
      )}

      {step === "phone" && (
        <div className="w-full max-w-sm">
          <label htmlFor="kiosk-phone" className="block text-2xl font-semibold mb-1">
            {S.enterPhone}
          </label>
          <p className="text-base text-muted-foreground mb-4">{S.enterPhoneHelp}</p>

          <input
            id="kiosk-phone"
            // A real input so a keyboard and a screen reader both work, but
            // readOnly so the SYSTEM keyboard never covers the keypad below.
            readOnly
            value={formatPhone(digits)}
            inputMode="none"
            aria-describedby="kiosk-phone-error"
            className="w-full text-center text-4xl tracking-widest rounded-lg border-2 px-4 py-4 mb-4 tabular-nums"
          />

          {/* Large numeric buttons rather than the system keyboard: one-handed,
              reachable, and nothing shifts under the parent's thumb. */}
          <div className="grid grid-cols-3 gap-3">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
              <KeyButton key={d} label={d} onPress={() => setDigits((p) => appendDigit(p, d))} />
            ))}
            <KeyButton label={S.clear} small onPress={() => setDigits("")} />
            <KeyButton label="0" onPress={() => setDigits((p) => appendDigit(p, "0"))} />
            <KeyButton
              label={<Delete className="h-7 w-7 mx-auto" aria-hidden />}
              ariaLabel={S.back}
              onPress={() => setDigits(removeDigit)}
            />
          </div>

          {error && (
            <p
              id="kiosk-phone-error"
              role="alert"
              className="mt-4 text-lg text-destructive"
            >
              {error}
            </p>
          )}

          {/* The dead end the desk closed the same way: a number that matches
              nobody is how a visiting family finds out they are one. Offered
              right here, with the number they just typed carried into the
              form, rather than sending them back to the welcome screen to
              find the same button. Only for a miss — not for a rate limit or
              a revoked device, where "register again" is the wrong answer. */}
          {error === S.notFound && (
            <Button
              variant="outline"
              className="w-full h-14 text-lg mt-3 [&_svg]:size-5"
              onClick={() => setAddingVisitor(true)}
            >
              <UserPlus aria-hidden />
              {S.visiting}
            </Button>
          )}

          <Button
            size="lg"
            className="w-full h-16 text-xl mt-5"
            disabled={!isSearchable(digits) || busy}
            onClick={() => void find()}
          >
            {busy && <Loader2 className="h-5 w-5 mr-2 animate-spin" aria-hidden />}
            {busy ? S.searching : S.find}
          </Button>

          <Button variant="ghost" className="w-full h-12 mt-2" onClick={wipe}>
            {S.back}
          </Button>
        </div>
      )}

      {step === "children" && (
        <div className="w-full max-w-2xl">
          <h1 className="text-3xl font-bold mb-1">{S.whoIsHere}</h1>
          <p className="text-lg text-muted-foreground mb-6">{S.tapToInclude}</p>

          <div className="grid gap-3 sm:grid-cols-2">
            {children.map((c) => {
              const on = selected.includes(c.child_person_id);
              return (
                /* A DIV WRAPPING TWO BUTTONS, not one button containing
                   another. Nesting them is invalid HTML and a screen reader
                   announces neither, which on a public device is the whole
                   accessibility promise of this page broken for the sake of a
                   tidier tile. The border moves out here so the two still read
                   as one card. */
                <div
                  key={c.child_person_id}
                  className={`rounded-xl border-2 transition
                    ${on ? "border-primary bg-primary/10" : "border-muted"}
                    ${c.already_checked_in ? "opacity-60" : ""}`}
                >
                  <button
                    type="button"
                    aria-pressed={on}
                    disabled={c.already_checked_in}
                    onClick={() =>
                      setSelected((p) =>
                        p.includes(c.child_person_id)
                          ? p.filter((x) => x !== c.child_person_id)
                          : [...p, c.child_person_id],
                      )
                    }
                    className="w-full min-h-[5.5rem] p-4 text-left text-xl"
                  >
                    <span className="font-semibold">{c.child_name}</span>
                    {/* Words, never colour alone: the tick and the badge both
                        say what they mean for a parent who cannot tell the
                        border colours apart. */}
                    <span className="block text-base text-muted-foreground mt-1">
                      {c.already_checked_in
                        ? S.alreadyIn
                        : on
                          ? "Checking in"
                          : "Not checking in"}
                      {c.grade_name ? ` · ${c.grade_name}` : ""}
                    </span>
                  </button>

                  {/* The same control the staffed desk has had since March,
                      in the same shape, so a volunteer who helps a parent at
                      the kiosk is not learning a second idiom. A native select
                      opens the tablet's own full-screen picker, which is why
                      it beats a custom list here: the OS gives large targets,
                      a scroll wheel and VoiceOver support for free.

                      Only for a child who is actually coming in, and only when
                      there are classrooms to choose between. If the room list
                      failed or nothing is open this is simply absent, and the
                      screen behaves as it did before it could choose. */}
                  {on && !c.already_checked_in && rooms.length > 0 && (
                    <div className="border-t px-4 py-3">
                      <label
                        htmlFor={`kiosk-room-${c.child_person_id}`}
                        className="block text-base text-muted-foreground mb-1"
                      >
                        {S.classroomLabel}
                      </label>
                      {/* A SIBLING of the tile's button, not inside it. The
                          desk nests its select in the tile and has to
                          stopPropagation on every click to stop the tile
                          toggling underneath; here there is nothing to stop,
                          because there is nothing wrapped around it. */}
                      <select
                        id={`kiosk-room-${c.child_person_id}`}
                        value={roomChoice[c.child_person_id] ?? ""}
                        onChange={(e) =>
                          chooseRoom(c.child_person_id, e.target.value)
                        }
                        // 44px floor, full width, and the text one step up
                        // from the desk's: this is read at arm's length on a
                        // wall-mounted tablet.
                        className="w-full min-h-[44px] rounded-lg border-2 bg-background
                          px-3 py-2 text-base font-semibold"
                      >
                        {/* The DEFAULT. It says how the decision is made
                            rather than naming the room, because the kiosk is
                            not told the answer: where a child lands is decided
                            by pick_room_for_child at commit time, and it
                            weighs a standing room preference and an age band
                            as well as the grade. A guess from the grade alone
                            would be wrong for exactly the children whose
                            placement is least obvious. The last screen names
                            the room each child actually got, from the
                            database's own rows.

                            Its value is "", so leaving it alone still sends a
                            null and placement keeps self-balancing. */}
                        <option value="">{S.byGradeOption}</option>
                        {rooms.map((r) => (
                          /* A full classroom is listed but cannot be picked.
                             The kiosk cannot override capacity — can_override
                             is false in the database — so offering it would be
                             a lie the parent only discovers after committing
                             their whole family. Said in words, because a
                             disabled option is grey and nothing else. */
                          <option
                            key={r.room_id}
                            value={r.room_id}
                            disabled={r.is_full}
                          >
                            {r.is_full ? S.fullOption(r.room_name) : r.room_name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {error && (
            <p role="alert" className="mt-4 text-lg text-destructive">
              {error}
            </p>
          )}

          <Button
            size="lg"
            className="w-full h-20 text-2xl mt-6"
            disabled={selected.length === 0 || busy}
            onClick={() => void checkIn()}
          >
            {busy && <Loader2 className="h-6 w-6 mr-2 animate-spin" aria-hidden />}
            {selected.length === 0 ? S.noneSelected : S.checkIn(selected.length)}
          </Button>

          <Button variant="ghost" className="w-full h-12 mt-2" onClick={wipe}>
            {S.back}
          </Button>
        </div>
      )}

      {step === "done" && code && (
        <div className="text-center w-full max-w-xl">
          <h1 className="text-4xl font-bold mb-2">
            {doneKind === "reprint" ? S.newSlipTitle : S.allDone}
          </h1>
          {/* A replaced slip says so in words: the old one stopped working
              the moment this screen appeared, and a parent who finds it in
              the car later must not hand it to anyone. */}
          <p className="text-xl text-muted-foreground mb-6">
            {printFailed
              ? S.printFailedBody
              : doneKind === "reprint"
                ? S.newSlipBody
                : S.keepCode}
          </p>

          {printFailed && (
            <p role="alert" className="text-2xl font-semibold mb-4">
              {S.printFailedTitle}
            </p>
          )}

          <p className="text-lg text-muted-foreground">{S.yourCode}</p>
          {/* text-6xl and tabular: this is the credential, and it has to be
              readable across a lobby and copyable onto a paper ticket. */}
          <div className="text-6xl font-bold tracking-[0.2em] tabular-nums my-4">
            {code}
          </div>

          {/* AFTER the code, which is the credential, but on screen at all —
              the label says the classroom and so should the screen, because a
              parent whose label did not print still has to know where to walk.
              Room names come from the batch the database wrote. */}
          {placed.length > 0 && (
            <div className="mx-auto max-w-sm text-left mt-2">
              <p className="text-lg text-muted-foreground mb-1">{S.takeThemTo}</p>
              <ul>
                {placed.map((pl, i) => (
                  <li key={`${pl.name}-${i}`} className="text-xl py-0.5">
                    <span className="font-semibold">{pl.name}</span>
                    {pl.room ? ` — ${pl.room}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Button
            size="lg"
            className="h-16 px-12 text-xl mt-4"
            onClick={wipe}
          >
            {S.startAgain}
          </Button>
        </div>
      )}

      {/* MOUNTED ONLY WHILE OPEN, both of them. Each dialog keeps what was
          typed in its own state and clears it only when IT closes itself;
          closed from out here — by the wipe, or by going offline — it would
          keep the previous family's names behind a shut door for the next
          parent to reopen. Unmounting is what empties it. */}
      {addingVisitor && (
        <VisitorFamilyDialog
          open
          onOpenChange={(o) => {
            if (!o) setAddingVisitor(false);
          }}
          // The number they just typed, when it is a whole one, so the family
          // is not asked for it twice.
          initialQuery={isSearchable(digits) ? formatPhone(digits) : undefined}
          onRegistered={visitorRegistered}
        />
      )}
      {reprinting && (
        <ReprintLabelDialog
          open
          onOpenChange={(o) => {
            if (!o) setReprinting(false);
          }}
          // This service when there is one; null is "any live batch", which
          // is the desk's own behaviour between sessions.
          sessionId={boot?.kids_session_id ?? null}
          onReprinted={(rows) => void slipReprinted(rows)}
        />
      )}
    </Shell>
  );
}

/** Full screen, no sidebar, nowhere to wander. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center gap-3 px-6 py-5">
        <img src={getLogoSrc()} alt="" className="h-9 w-9 rounded" aria-hidden />
        <span className="text-lg font-semibold">Kids Check-In</span>
      </header>
      {/* The 60px of padding keeps nothing essential in the top or bottom band
          of a wall-mounted tablet, where a hand naturally rests. */}
      <main className="flex-1 flex items-center justify-center px-6 py-[60px]">
        {children}
      </main>
    </div>
  );
}

function KeyButton({
  label,
  onPress,
  small,
  ariaLabel,
}: {
  label: React.ReactNode;
  onPress: () => void;
  small?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={ariaLabel}
      // 4.5rem is comfortably past the 44px floor, with real gaps between.
      className={`h-[4.5rem] rounded-xl border-2 bg-card font-semibold tabular-nums
        active:bg-muted ${small ? "text-lg" : "text-3xl"}`}
    >
      {label}
    </button>
  );
}
