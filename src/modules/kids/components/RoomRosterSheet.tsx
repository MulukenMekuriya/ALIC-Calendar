/**
 * The roster for one classroom, and the volunteer-to-parent message.
 *
 * The message is the third of the three parent notifications: check-in and
 * pick-up fire automatically from database triggers, but "please come to Room
 * 4" is a deliberate act by a person, so it lives here behind a button.
 */

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Textarea } from "@/shared/components/ui/textarea";
import { Label } from "@/shared/components/ui/label";
import { Separator } from "@/shared/components/ui/separator";
import {
  AlertTriangle,
  Loader2,
  MessageSquare,
  Phone,
  ShieldAlert,
  Send,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { kidsStationService } from "../services/kidsStationService";
import { useRoomRoster } from "../hooks/useKidsLeader";
import type { LiveBoardRoom, RosterRow } from "../services/kidsLeaderService";

interface RoomRosterSheetProps {
  room: LiveBoardRoom | null;
  onOpenChange: (open: boolean) => void;
}

/** Offered as one tap each, because they are what actually gets sent. */
const QUICK_MESSAGES = [
  "Please come to the Children's Ministry room now.",
  "Your child is asking for you — please come to the classroom.",
  "Your child is not feeling well. Please come to the classroom.",
];

export function RoomRosterSheet({ room, onOpenChange }: RoomRosterSheetProps) {
  const { data: roster, isLoading } = useRoomRoster(
    room?.kids_session_id,
    room?.room_id
  );
  const [messaging, setMessaging] = useState<RosterRow | null>(null);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);

  const roomLabel = room?.label_room_name || room?.room_name || "";
  const present = (roster ?? []).filter((r) => r.status === "checked_in");
  const gone = (roster ?? []).filter((r) => r.status !== "checked_in");

  function startMessage(child: RosterRow) {
    setMessaging(child);
    setMessageText(
      `Please come to the Children's Ministry room ${roomLabel} now.`
    );
  }

  async function send() {
    if (!messaging || !messageText.trim()) return;
    setSending(true);
    try {
      const recipients = await kidsStationService.sendParentMessage({
        checkInId: messaging.check_in_id,
        message: messageText.trim(),
      });

      // Zero recipients is not success. Say so plainly, because the volunteer
      // now has to go find the parent themselves.
      if (recipients.length === 0) {
        toast.warning("No one could be notified", {
          description:
            `No contactable parent is on file for ${messaging.child_name}. ` +
            "Find them in the service.",
        });
      } else {
        toast.success(
          `Message sent to ${recipients.map((r) => r.recipient_name).join(", ")}`
        );
      }
      setMessaging(null);
      setMessageText("");
    } catch (error) {
      toast.error("Could not send the message", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <Sheet open={!!room} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{roomLabel}</SheetTitle>
          <SheetDescription>
            {room?.grade_name ?? room?.age_band_name ?? "No grade set"} ·{" "}
            {room?.session_label ?? ""}
          </SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {messaging && (
              <div className="rounded-lg border bg-muted/40 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">
                    Message {messaging.child_name}'s parents
                  </Label>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setMessaging(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {QUICK_MESSAGES.map((quick) => (
                    <Button
                      key={quick}
                      variant="outline"
                      size="sm"
                      className="h-auto py-1 text-xs whitespace-normal text-left"
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
                  placeholder="What should the parents be told?"
                />
                <Button
                  onClick={send}
                  disabled={sending || !messageText.trim()}
                  className="w-full"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Send to parents
                </Button>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase text-muted-foreground">
                In the room ({present.length})
              </p>
              {present.length === 0 && (
                <p className="text-sm text-muted-foreground">No children checked in.</p>
              )}
              {present.map((child) => (
                <div
                  key={child.check_in_id}
                  className="flex items-center gap-3 rounded-md border p-2.5"
                >
                  <span className="font-mono text-xs text-muted-foreground w-10 shrink-0">
                    #{child.tag_number}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{child.child_name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {child.grade_name ?? "No grade on file"} ·{" "}
                      {child.minutes_in_room} min
                      {child.guardian_phone && (
                        <>
                          {" · "}
                          <Phone className="inline h-3 w-3" /> {child.guardian_phone}
                        </>
                      )}
                    </p>
                    {/* Check-in could not place this child by grade. Shown in
                        full rather than as an icon: it is the leader's cue to
                        move them, and there is no nursery to fall back on. */}
                    {child.assignment_reason && (
                      <p className="text-xs text-amber-700 dark:text-amber-500 mt-0.5">
                        {child.assignment_reason}
                      </p>
                    )}
                  </div>
                  {child.has_allergy && (
                    <Badge variant="outline" className="gap-1 border-amber-400 shrink-0">
                      <AlertTriangle className="h-3 w-3" />
                    </Badge>
                  )}
                  {child.has_restriction && (
                    <Badge variant="destructive" className="gap-1 shrink-0">
                      <ShieldAlert className="h-3 w-3" />
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    title="Message parents"
                    onClick={() => startMessage(child)}
                  >
                    <MessageSquare className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            {gone.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase text-muted-foreground">
                    Collected ({gone.length})
                  </p>
                  {gone.map((child) => (
                    <div
                      key={child.check_in_id}
                      className="flex items-center gap-3 rounded-md border border-dashed p-2.5 opacity-70"
                    >
                      <span className="font-mono text-xs text-muted-foreground w-10 shrink-0">
                        #{child.tag_number}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm truncate">{child.child_name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {child.picked_up_by_name || "collected"}
                          {child.checkout_method === "operator_override" &&
                            " · override"}
                        </p>
                      </div>
                      {child.checkout_method === "operator_override" && (
                        <Badge variant="outline" className="border-amber-400 shrink-0">
                          Override
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
