/**
 * The late-collection review queue.
 *
 * Detection is automatic; telling a family is not. Every row arrives at
 * "recorded" and stays there until a leader sends a note or dismisses it, so
 * nothing reaches a parent that a human did not choose to send. Unreviewed
 * rows sort first, because the queue is the whole point of the screen.
 *
 * Two sources, and the difference matters enough to show on every row.
 * "checkout" is measured against the end of the service. "never_collected"
 * means nobody recorded a collection at all — the church does not know what
 * happened, and the drafted wording says exactly that rather than accusing
 * anyone of leaving a child behind.
 */

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Textarea } from "@/shared/components/ui/textarea";
import { Label } from "@/shared/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Loader2, Mail, X } from "lucide-react";
import { toast } from "sonner";
import {
  useLatePickups,
  useNotifyLatePickup,
  useDismissLatePickup,
} from "../hooks/useKidsLeader";
import type { LatePickupRow } from "../services/kidsLeaderService";
import { errorMessage, isDbError } from "../services/rpcError";

interface LatePickupsPanelProps {
  organizationId: string | undefined;
  from: string;
  to: string;
  canReview: boolean;
}

export function LatePickupsPanel({
  organizationId,
  from,
  to,
  canReview,
}: LatePickupsPanelProps) {
  const { data, isLoading } = useLatePickups(organizationId, from, to);
  const notify = useNotifyLatePickup(organizationId);
  const dismiss = useDismissLatePickup(organizationId);

  const [sending, setSending] = useState<LatePickupRow | null>(null);
  const [message, setMessage] = useState("");
  const [dismissing, setDismissing] = useState<LatePickupRow | null>(null);
  const [reason, setReason] = useState("");

  const rows = data ?? [];
  const unreviewed = rows.filter((r) => r.status === "recorded").length;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Late collections</CardTitle>
          <CardDescription>
            {rows.length === 0
              ? "Nothing recorded in this period."
              : `${rows.length} recorded, ${unreviewed} not yet reviewed. Nothing is sent to a family unless you send it.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No late collections in this period.
            </p>
          ) : (
            <div className="space-y-2">
              {rows.map((row) => (
                <div key={row.id} className="rounded-md border p-3 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={
                        row.source === "never_collected" ? "destructive" : "outline"
                      }
                    >
                      {row.source === "never_collected"
                        ? "No collection recorded"
                        : `${row.minutes_late} min late`}
                    </Badge>
                    <span className="text-sm font-medium">{row.child_name}</span>
                    {row.room_name && (
                      <span className="text-xs text-muted-foreground">
                        {row.room_name}
                      </span>
                    )}
                    {row.times_in_range > 1 && (
                      <Badge variant="secondary">
                        {row.times_in_range}× in this period
                      </Badge>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {row.session_date}
                    </span>
                  </div>

                  {row.status === "notified" && (
                    <p className="text-xs text-muted-foreground">
                      A note was sent by {row.reviewed_by_name ?? "a leader"}.
                    </p>
                  )}
                  {row.status === "dismissed" && (
                    <p className="text-xs text-muted-foreground">
                      Dismissed by {row.reviewed_by_name ?? "a leader"} —{" "}
                      {row.dismissed_reason}
                    </p>
                  )}

                  {canReview && row.status === "recorded" && (
                    <div className="flex flex-wrap gap-2 pt-0.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSending(row);
                          setMessage("");
                        }}
                      >
                        <Mail className="h-4 w-4" />
                        Send a note
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setDismissing(row);
                          setReason("");
                        }}
                      >
                        <X className="h-4 w-4" />
                        Dismiss
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={sending !== null} onOpenChange={(o) => !o && setSending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send a note about {sending?.child_name}</DialogTitle>
            <DialogDescription>
              This goes to the parents and guardians on file. Leave it blank to
              send our usual wording, which is warm and mentions no consequence.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="late-message">Your own words (optional)</Label>
            <Textarea
              id="late-message"
              rows={6}
              value={message}
              placeholder="Leave blank to use the standard note."
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSending(null)}>
              Cancel
            </Button>
            <Button
              disabled={notify.isPending}
              onClick={async () => {
                if (!sending) return;
                try {
                  const n = await notify.mutateAsync({
                    id: sending.id,
                    message: message.trim() || null,
                  });
                  toast.success(
                    n > 0
                      ? `Sent to ${n} ${n === 1 ? "person" : "people"}`
                      : "Nobody on file to send to",
                    {
                      description:
                        n > 0
                          ? undefined
                          : "This family has no contactable guardian recorded.",
                    }
                  );
                  setSending(null);
                } catch (err) {
                  toast.error("Could not send", {
                    description: isDbError(err, "already_reviewed")
                      ? "Somebody else has already dealt with this one."
                      : errorMessage(err),
                  });
                }
              }}
            >
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dismissing !== null}
        onOpenChange={(o) => !o && setDismissing(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dismiss this one</DialogTitle>
            <DialogDescription>
              The record stays; it just leaves the queue. Say why, so the next
              person reading the list knows.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="dismiss-reason">Why</Label>
            <Textarea
              id="dismiss-reason"
              rows={3}
              value={reason}
              placeholder="Spoke with them at the door."
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDismissing(null)}>
              Cancel
            </Button>
            <Button
              disabled={dismiss.isPending || reason.trim().length < 5}
              onClick={async () => {
                if (!dismissing) return;
                try {
                  await dismiss.mutateAsync({
                    id: dismissing.id,
                    reason: reason.trim(),
                  });
                  toast.success("Dismissed");
                  setDismissing(null);
                } catch (err) {
                  toast.error("Could not dismiss", {
                    description: isDbError(err, "already_reviewed")
                      ? "Somebody else has already dealt with this one."
                      : errorMessage(err),
                  });
                }
              }}
            >
              Dismiss
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
