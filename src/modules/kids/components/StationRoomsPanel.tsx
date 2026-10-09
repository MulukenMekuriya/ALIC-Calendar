/**
 * "Who is in my room" for a classroom volunteer, and the parent message.
 *
 * This is the third parent-notification feature. Check-in and pick-up
 * notifications are automatic — database triggers fire them with no one
 * involved. This one is a deliberate act by the volunteer standing with the
 * child, so it needs a person, a child, and a button.
 *
 * Touch targets are sized for the same tablet the rest of the station runs on.
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRightLeft,
  UserCheck,
  UserPlus,
  HeartPulse,
  Loader2,
  MessageSquare,
  RefreshCw,
  Send,
  ShieldAlert,
} from "lucide-react";
import { kidsStationService } from "../services/kidsStationService";
import { errorMessage, isDbError } from "../services/rpcError";
import type { SafetyCard, StationRoom, StationRosterRow } from "../types";

interface StationRoomsPanelProps {
  sessionId: string;
  online: boolean;
  onExit: () => void;
}

export function StationRoomsPanel({
  sessionId,
  online,
  onExit,
}: StationRoomsPanelProps) {
  const [rooms, setRooms] = useState<StationRoom[]>([]);
  const [room, setRoom] = useState<StationRoom | null>(null);
  const [roster, setRoster] = useState<StationRosterRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Which room I have put myself in, so the ratio warnings mean something. */
  const [myRoomId, setMyRoomId] = useState<string | null>(null);
  const [shiftBusy, setShiftBusy] = useState(false);
  const [moving, setMoving] = useState<StationRosterRow | null>(null);
  const [safety, setSafety] = useState<SafetyCard | null>(null);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [messaging, setMessaging] = useState<StationRosterRow | null>(null);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);

  const loadRooms = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRooms(await kidsStationService.sessionRooms(sessionId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  const loadRoster = useCallback(
    async (target: StationRoom) => {
      setLoading(true);
      setError(null);
      try {
        setRoster(await kidsStationService.roomRoster(sessionId, target.room_id));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [sessionId]
  );

  useEffect(() => {
    void loadRooms();
  }, [loadRooms]);

  // Where am I already serving, if I came back to this screen?
  useEffect(() => {
    let cancelled = false;
    kidsStationService
      .myCurrentShift(sessionId)
      .then((shift) => {
        if (!cancelled) setMyRoomId(shift?.room_id ?? null);
      })
      .catch(() => {
        /* Not being on a shift is a normal answer, not an error. */
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  async function toggleMyShift(target: StationRoom) {
    setShiftBusy(true);
    setError(null);
    try {
      if (myRoomId === target.room_id) {
        await kidsStationService.endMyShift(sessionId);
        setMyRoomId(null);
      } else {
        await kidsStationService.startMyShift(sessionId, target.room_id);
        setMyRoomId(target.room_id);
      }
      await loadRooms();
    } catch (err) {
      setError(
        isDbError(err, "no_member_record")
          ? "Your login is not linked to a member record yet, so this cannot be attributed to you. Ask an admin to link it."
          : errorMessage(err)
      );
    } finally {
      setShiftBusy(false);
    }
  }

  async function moveChild(child: StationRosterRow, toRoomId: string) {
    try {
      await kidsStationService.transferChild(
        child.check_in_id,
        toRoomId,
        "Moved at the classroom door"
      );
      setMoving(null);
      if (room) await loadRoster(room);
      await loadRooms();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  // A roster on a wall-mounted tablet goes stale silently, so refresh it while
  // the room is open rather than trusting whatever was true on first load.
  useEffect(() => {
    if (!room || !online) return;
    const timer = window.setInterval(() => void loadRoster(room), 20_000);
    return () => window.clearInterval(timer);
  }, [room, online, loadRoster]);

  /**
   * KID-018. This is the screen a volunteer is on when something goes wrong,
   * so the medical detail has to be one tap away — and every tap is written
   * to the audit log server-side, which is what makes that access accountable.
   */
  async function openSafety(child: StationRosterRow) {
    setSafety(null);
    setSafetyOpen(true);
    try {
      setSafety(await kidsStationService.safetyCard(child.check_in_id));
    } catch (err) {
      setSafetyOpen(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function send() {
    if (!messaging || !messageText.trim()) return;
    setSending(true);
    setSendResult(null);
    try {
      const recipients = await kidsStationService.sendParentMessage({
        checkInId: messaging.check_in_id,
        message: messageText.trim(),
      });
      // No recipients is not success — the volunteer has to go find the parent.
      setSendResult(
        recipients.length === 0
          ? `No contactable parent on file for ${messaging.child_display_name}. Find them in the service.`
          : `Sent to ${recipients.map((r) => r.recipient_name).join(", ")}.`
      );
      if (recipients.length > 0) {
        setMessaging(null);
        setMessageText("");
      }
    } catch (err) {
      setSendResult(
        `Could not send: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setSending(false);
    }
  }

  /* ------------------------------------------------------------ room list */
  if (!room) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold">Choose your room</h2>
          <Button variant="ghost" onClick={onExit}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        </div>

        {error && <p className="mt-4 text-destructive text-sm">{error}</p>}

        {loading && rooms.length === 0 ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {rooms.map((option) => (
              <div key={option.room_id} className="rounded-lg border p-5">
              <button
                className="w-full text-left"
                onClick={() => {
                  setRoom(option);
                  void loadRoster(option);
                }}
              >
                <p className="text-lg font-medium">{option.room_name}</p>
                <p className="text-sm text-muted-foreground">
                  {option.grade_name ?? option.age_band_name ?? "No grade"}
                </p>
                {/* Checkout happens at this door, so whose room it is matters
                    to the parent standing in front of it. */}
                {option.teachers && (
                  <p className="text-sm text-muted-foreground truncate">
                    {option.teachers}
                  </p>
                )}
                <p className="mt-2 text-2xl font-bold tabular-nums">
                  {option.checked_in_count}
                  {option.capacity != null && (
                    <span className="text-base font-normal text-muted-foreground">
                      {" "}
                      / {option.capacity}
                    </span>
                  )}
                </p>
              </button>
              {/* Until a volunteer could say "I am here", every staffed room
                  reported "no volunteer assigned" and the ratio warning was
                  wrong all morning — which teaches people to ignore it. */}
              <Button
                variant={myRoomId === option.room_id ? "default" : "outline"}
                className="mt-2 w-full"
                disabled={shiftBusy || !online}
                onClick={() => void toggleMyShift(option)}
              >
                {shiftBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : myRoomId === option.room_id ? (
                  <UserCheck className="h-4 w-4" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
                {myRoomId === option.room_id ? "Serving here" : "I'm serving here"}
              </Button>
              </div>
            ))}
            {rooms.length === 0 && !loading && (
              <p className="text-muted-foreground py-8">
                No classrooms are open for this service.
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  /* --------------------------------------------------------------- roster */
  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-2xl font-semibold">{room.room_name}</h2>
          <p className="text-sm text-muted-foreground">
            {room.grade_name ? `${room.grade_name} · ` : ""}
            {roster.length} in the room
            {room.teachers ? ` · ${room.teachers}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => void loadRoster(room)}
            disabled={loading}
          >
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setRoom(null);
              setRoster([]);
              setMessaging(null);
              setSendResult(null);
            }}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Rooms
          </Button>
        </div>
      </div>

      {error && <p className="mt-4 text-destructive text-sm">{error}</p>}

      {sendResult && (
        <div className="mt-4 rounded-md border bg-muted/40 p-3 text-sm">
          {sendResult}
        </div>
      )}

      {messaging && (
        <div className="mt-4 rounded-lg border p-4 space-y-3">
          <p className="font-medium">
            Message {messaging.child_display_name}'s parents
          </p>
          <div className="flex flex-wrap gap-2">
            {[
              `Please come to the Children's Ministry room ${room.room_name} now.`,
              "Your child is asking for you — please come to the classroom.",
              "Your child is not feeling well. Please come to the classroom.",
            ].map((quick) => (
              <Button
                key={quick}
                variant="outline"
                className="h-auto whitespace-normal py-2 text-left text-sm"
                onClick={() => setMessageText(quick)}
              >
                {quick}
              </Button>
            ))}
          </div>
          <Textarea
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            rows={3}
            className="text-base"
            placeholder="What should the parents be told?"
          />
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="lg"
              onClick={() => {
                setMessaging(null);
                setMessageText("");
              }}
            >
              Cancel
            </Button>
            <Button
              size="lg"
              className="flex-1"
              disabled={sending || !messageText.trim() || !online}
              onClick={send}
            >
              {sending ? (
                <Loader2 className="h-5 w-5 mr-1 animate-spin" />
              ) : (
                <Send className="h-5 w-5 mr-1" />
              )}
              Send to parents
            </Button>
          </div>
        </div>
      )}

      <div className="mt-5 space-y-2">
        {roster.map((child) => (
          <div
            key={child.check_in_id}
            className="flex items-center gap-3 rounded-lg border p-4"
          >
            <span className="font-mono text-sm text-muted-foreground w-14 shrink-0">
              #{child.tag_number}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-lg font-medium truncate">
                {child.child_display_name}
              </p>
              <p className="text-sm text-muted-foreground">
                {child.minutes_in_room} min
              </p>
            </div>
            {child.has_allergy && (
              <Badge variant="outline" className="border-amber-400 gap-1 shrink-0">
                <AlertTriangle className="h-3.5 w-3.5" />
                Allergy
              </Badge>
            )}
            {child.has_restriction && (
              <Badge variant="destructive" className="gap-1 shrink-0">
                <ShieldAlert className="h-3.5 w-3.5" />
              </Badge>
            )}
            <Button
              variant="outline"
              size="lg"
              className="shrink-0"
              title="Move to another room"
              disabled={!online}
              onClick={() => setMoving(child)}
            >
              <ArrowRightLeft className="h-5 w-5" />
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="shrink-0"
              title="Allergies, medication and emergency contact"
              onClick={() => void openSafety(child)}
            >
              <HeartPulse className="h-5 w-5" />
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="shrink-0"
              disabled={!online}
              onClick={() => {
                setSendResult(null);
                setMessaging(child);
                setMessageText(
                  `Please come to the Children's Ministry room ${room.room_name} now.`
                );
              }}
            >
              <MessageSquare className="h-5 w-5" />
            </Button>
          </div>
        ))}
        {roster.length === 0 && !loading && (
          <p className="py-10 text-center text-muted-foreground">
            No children are checked into this room.
          </p>
        )}
      </div>

      {/* Moving keeps the child's pickup code. Checking them out and back in
          would ROTATE it, leaving the parent holding a dead label. */}
      <Dialog open={moving !== null} onOpenChange={(o) => !o && setMoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move {moving?.child_display_name}</DialogTitle>
            <DialogDescription>
              Their pickup code stays the same, so the label the parent is
              holding still works.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {rooms
              .filter((r) => r.room_id !== moving?.room_id)
              .map((r) => (
                <button
                  key={r.room_id}
                  className="flex w-full items-center gap-3 rounded-lg border p-4 text-left hover:bg-muted/50"
                  onClick={() => moving && void moveChild(moving, r.room_id)}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{r.room_name}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      {r.grade_name ?? r.age_band_name ?? "No grade"}
                      {r.teachers ? ` · ${r.teachers}` : ""}
                    </p>
                  </div>
                  <span className="tabular-nums text-muted-foreground shrink-0">
                    {r.checked_in_count}
                    {r.capacity != null && ` / ${r.capacity}`}
                  </span>
                </button>
              ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={safetyOpen}
        onOpenChange={(open) => {
          setSafetyOpen(open);
          if (!open) setSafety(null);
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
                <Row label="Allergies" value={safety.allergies} highlight />
                <Row label="Severity" value={safety.allergy_severity} />
                <Row label="Medications" value={safety.medications} />
                <Row label="Special needs" value={safety.special_needs} />
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
    </div>
  );
}

/** One line of the safety card. Absence is stated, never left blank. */
function Row({
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
