/**
 * Who has not been collected.
 *
 * The end-of-service question, and nothing answered it: a leader opened each
 * classroom sheet in turn, and once the session auto-closed the children
 * disappeared from the live board entirely — so the one moment this matters
 * most was the moment it stopped working.
 *
 * Deliberately org-wide rather than scoped to the open session, because a
 * child left in a session that has already ended is exactly the child a
 * session-scoped view cannot show you.
 *
 * The guardian's phone is right here and tappable. At 12:40 the next action is
 * always a phone call, and making someone navigate to a profile to find the
 * number is the difference between calling and waiting.
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import {
  AlertTriangle,
  Loader2,
  Phone,
  ShieldAlert,
  CheckCircle2,
  Eraser,
  UserCheck,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useCapabilities } from "@/shared/hooks/useCapabilities";
import {
  useStillHere,
  useExpireOpenCheckIns,
  useReleaseFromBoard,
} from "../hooks/useKidsLeader";
import type { StillHereRow } from "../services/kidsLeaderService";
import { errorMessage, isDbError } from "../services/rpcError";

/** Past this, a child has been waiting long enough to chase. */
const LONG_STAY_MINUTES = 150;

interface StillHerePanelProps {
  organizationId: string | undefined;
  onOpenChild?: (checkInId: string) => void;
}

export function StillHerePanel({
  organizationId,
  onOpenChild,
}: StillHerePanelProps) {
  const { data, isLoading } = useStillHere(organizationId);
  const { can } = useCapabilities();
  const [confirming, setConfirming] = useState(false);
  const expire = useExpireOpenCheckIns(organizationId);
  // kids.override is held by kids_admin and nobody below it, which is the same
  // line the RPC draws. A team lead clearing the branch-wide board is the thing
  // 20260321001100 argued against — and releasing a child without the pickup
  // code is the same authority, so both buttons hang off the same capability.
  const canOverride = can("kids.override");

  // The child a lead is releasing without a code, and who they say is taking
  // them. Held here rather than on the row so only one dialog can ever be open.
  const [releasing, setReleasing] = useState<StillHereRow | null>(null);
  const [collectedBy, setCollectedBy] = useState("");
  const release = useReleaseFromBoard(organizationId);

  const children = data ?? [];
  // A child whose service has ENDED is the real alarm — everyone else has gone
  // home and nobody is watching the board any more.
  const afterHours = children.filter((c) => c.session_status !== "open");

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (children.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 py-6">
          <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
          <div>
            <p className="font-medium">Everyone has been collected</p>
            <p className="text-sm text-muted-foreground">
              No child is checked in anywhere.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
    <Card className={afterHours.length > 0 ? "border-destructive" : undefined}>
      <CardHeader className="pb-3 flex-row items-start justify-between space-y-0 gap-4">
        <div className="min-w-0">
        <CardTitle className="text-base flex items-center gap-2">
          {afterHours.length > 0 && (
            <AlertTriangle className="h-4 w-4 text-destructive" />
          )}
          Still here ({children.length})
        </CardTitle>
        <CardDescription>
          {afterHours.length > 0
            ? `${afterHours.length} of these ${
                afterHours.length === 1 ? "is" : "are"
              } in a service that has already ended.`
            : "Children currently in a classroom."}
        </CardDescription>
        </div>
        {/*
          Only offered once a service has actually ended. While a service is
          running, a child on this list is in a classroom being looked after,
          and "clear the board" is never the right answer to that.
        */}
        {canOverride && afterHours.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => setConfirming(true)}
          >
            <Eraser className="h-4 w-4" />
            Close off the board
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-2">
        {children.map((c) => {
          const stale = c.session_status !== "open";
          const long = c.minutes_in_room >= LONG_STAY_MINUTES;
          return (
            <div
              key={c.check_in_id}
              className={cn(
                "flex items-center gap-3 rounded-md border p-2.5",
                stale && "border-destructive/50 bg-destructive/5"
              )}
            >
              <span className="font-mono text-xs text-muted-foreground w-10 shrink-0">
                #{c.tag_number}
              </span>

              <button
                className="min-w-0 flex-1 text-left"
                onClick={() => onOpenChild?.(c.check_in_id)}
              >
                <p className="text-sm font-medium truncate">{c.child_name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {c.room_name ?? "No room"} · {c.minutes_in_room} min
                  {stale && ` · ${c.session_label ?? "service"} has ended`}
                </p>
              </button>

              {c.has_restriction && (
                <Badge variant="destructive" className="gap-1 shrink-0">
                  <ShieldAlert className="h-3 w-3" />
                </Badge>
              )}
              {c.has_allergy && (
                <Badge variant="outline" className="border-amber-400 shrink-0">
                  <AlertTriangle className="h-3 w-3" />
                </Badge>
              )}
              {(stale || long) && !c.has_restriction && (
                <Badge variant="outline" className="border-amber-400 shrink-0">
                  {stale ? "After hours" : "Long stay"}
                </Badge>
              )}

              {c.guardian_phone ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  asChild
                >
                  <a href={`tel:${c.guardian_phone}`}>
                    <Phone className="h-4 w-4" />
                    {c.guardian_name?.split(" ")[0] ?? "Call"}
                  </a>
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground shrink-0">
                  No number
                </span>
              )}

              {/*
                A lead can release a child from here without the pickup code.
                The label is hidden on a narrow screen rather than the button:
                on a phone this row is already four items wide, and the icon is
                the one thing that must survive.
              */}
              {canOverride && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="shrink-0"
                  onClick={() => {
                    setReleasing(c);
                    setCollectedBy(c.guardian_name ?? "");
                  }}
                >
                  <UserCheck className="h-4 w-4" />
                  <span className="hidden sm:inline">Check out</span>
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>

    {/*
      Releasing a child without the pickup code.

      ONE TAP, BUT NOT A SILENT ONE. The code is skipped because a lead does
      not need it — check_out_children has always had an override branch and
      kids_admin has always been able to take it. What the code was carrying
      besides authority is a NAME: the parent holding the slip is the parent
      who gets the child. So the one thing this dialog insists on is who is
      taking them, pre-filled from the guardian on the row so that in the
      ordinary case it really is a single tap.

      Every denial the database can return here is silent — it returns zero
      rows rather than raising, so that a desk cannot be used to probe for
      valid codes. That makes an empty result the dangerous case, not the
      boring one, and it is shouted at rather than shrugged off.
    */}
    <AlertDialog
      open={releasing !== null}
      onOpenChange={(open) => {
        if (!open) setReleasing(null);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Check out {releasing?.child_name}?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                No pick-up code will be checked. This is recorded as an{" "}
                <strong>override</strong> against your name, and it counts as a
                collection — if the service ended long ago it is still logged
                as a late one.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {releasing?.has_restriction && (
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertDescription>
              This child has a <strong>protective order</strong> on file. If the
              person collecting them is not on the approved list, releasing them
              here is recorded as a restricted-pickup override. The order itself
              still holds: the database will refuse outright if the name below
              is the person it names.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label htmlFor="collected-by">Collected by</Label>
          <Input
            id="collected-by"
            value={collectedBy}
            placeholder="Who is taking them"
            onChange={(e) => setCollectedBy(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Written into the child's record. Change it if someone other than
            the guardian is collecting.
          </p>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={release.isPending || collectedBy.trim().length === 0}
            onClick={async (e) => {
              // The dialog stays open unless the child actually left, so a
              // refusal cannot be dismissed by the same tap that caused it.
              e.preventDefault();
              const row = releasing;
              if (!row) return;
              const name = collectedBy.trim();
              try {
                const out = await release.mutateAsync({
                  checkInId: row.check_in_id,
                  collectedBy: name,
                });
                if (out.length === 0) {
                  toast.error("Nothing was released", {
                    description:
                      "Do NOT hand the child over. The pick-up may be restricted, or another desk has already collected them.",
                  });
                  return;
                }
                toast.success(`${row.child_name} checked out`, {
                  description: `Recorded as collected by ${name}, without a code, against your name.`,
                });
                setReleasing(null);
              } catch (err) {
                toast.error("Could not check them out", {
                  description: isDbError(err, "override_requires_admin")
                    ? "Your login cannot release a child without the code."
                    : isDbError(err, "not_permitted_to_check_out")
                      ? "Your login cannot release children at all."
                      : errorMessage(err),
                });
              }
            }}
          >
            {release.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Check out
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/*
      The wording is the safeguard. "Check them out" is what a leader will
      assume this button means, and it is the one thing it must not be allowed
      to mean — so the dialog says what is actually recorded, and says the
      quiet part: the system does not know where these children are.
    */}
    <AlertDialog open={confirming} onOpenChange={setConfirming}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Close off {children.length}{" "}
            {children.length === 1 ? "child" : "children"} on the board?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                This does <strong>not</strong> record that they were collected.
                Each one is marked <strong>expired</strong> — a note that nobody
                checked them out at the desk — and their parents are not told
                anything.
              </p>
              <p>
                Use it to tidy the board after everyone has gone home. If you do
                not know where one of these children is, this button is not the
                answer.
              </p>
              <p className="text-xs">
                Recorded against your name, and the other Kids Ministry leaders
                are emailed the list.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={expire.isPending}
            onClick={async (e) => {
              e.preventDefault();
              try {
                const r = await expire.mutateAsync({});
                toast.success(
                  `Closed off ${r.expired_count} ${
                    r.expired_count === 1 ? "child" : "children"
                  }`,
                  {
                    description:
                      "Marked as not collected, not as picked up. The other leaders have been emailed.",
                  }
                );
                setConfirming(false);
              } catch (err) {
                toast.error("Could not close off the board", {
                  description:
                    err instanceof Error ? err.message : String(err),
                });
              }
            }}
          >
            {expire.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Close off the board
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
