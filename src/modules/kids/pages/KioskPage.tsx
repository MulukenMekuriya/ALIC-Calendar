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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Loader2, Delete, WifiOff } from "lucide-react";
import { getLogoSrc } from "@/shared/constants/branding";
import { kioskService, type KioskBootstrap, type KioskChild } from "../services/kioskService";
import { kidsStationService } from "../services/kidsStationService";
import { kioskStrings as S } from "../utils/kioskStrings";
import { STATION_STORAGE_KEY } from "../types";
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [printFailed, setPrintFailed] = useState(false);
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const idleTimer = useRef<number | null>(null);

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
    setError(null);
    setCode(null);
    setPrintFailed(false);
  }, []);

  useEffect(() => {
    // Every screen except the idle one is wiped after inactivity. On a shared
    // lobby device the next parent must never see the previous family's
    // children, and the pick-up code must never be left up for a stranger.
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
    if (step === "idle") return;
    const ms = step === "done" ? DONE_RESET_MS : IDLE_WIPE_MS;
    idleTimer.current = window.setTimeout(wipe, ms);
    return () => {
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
    };
  }, [step, digits, children, wipe]);

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
        roomIds: childIds.map(() => null),
      });

      const accepted = rows.filter((r) => !r.refused);
      if (accepted.length === 0) {
        // Everything was refused. The database's own words, because "try
        // again" would be a lie — trying again does exactly the same thing.
        setError(rows[0]?.refusal_message ?? S.noSession);
        return;
      }

      setCode(accepted[0].pickup_code);
      setStep("done");

      // Print only AFTER the database has committed. A printed label with no
      // row behind it is the worst possible outcome.
      const qr = await renderQrSvg(accepted[0].pickup_token);
      const result = await printLabels(
        accepted.map((r) => ({
          childName: r.child_name,
          roomName: r.room_name,
          tagNumber: r.tag_number,
          allergyLabel: r.allergy_label,
          pickupCode: accepted[0].pickup_code,
          serviceLabel: boot.session_label ?? "",
          sessionDate: formatSessionDate(boot.session_date),
          checkInTime: formatClockTime(),
          guardianName: null,
          guardianPhone: r.guardian_phone ?? null,
        })),
        {
          householdName: children[0]?.household_name ?? "",
          childCount: accepted.length,
          pickupCode: accepted[0].pickup_code,
          qrSvg: qr,
        },
      );
      if (!result.ok) setPrintFailed(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const announce = useMemo(() => {
    if (busy) return S.searching;
    if (error) return error;
    if (step === "done" && code) return `${S.allDone}. ${S.yourCode} ${code}`;
    return "";
  }, [busy, error, step, code]);

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
                <button
                  key={c.child_person_id}
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
                  className={`min-h-[5.5rem] rounded-xl border-2 p-4 text-left text-xl transition
                    ${on ? "border-primary bg-primary/10" : "border-muted"}
                    ${c.already_checked_in ? "opacity-60" : ""}`}
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
          <h1 className="text-4xl font-bold mb-2">{S.allDone}</h1>
          <p className="text-xl text-muted-foreground mb-6">
            {printFailed ? S.printFailedBody : S.keepCode}
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

          <Button
            size="lg"
            className="h-16 px-12 text-xl mt-4"
            onClick={wipe}
          >
            {S.startAgain}
          </Button>
        </div>
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
