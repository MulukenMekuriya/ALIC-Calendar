/**
 * What the consent rule currently says, and how a kids admin changes it.
 *
 * THIS SCREEN EXISTS FOR ONE MOMENT. If the first enforced Sunday goes badly
 * — a queue out of the door, families turned away, a volunteer on the phone —
 * somebody needs to stop it in ten seconds, from a tablet, without finding a
 * developer on a Sunday morning. That is the "Pause the rule" button. Nothing
 * else here is urgent; that one is, and it is why the card is not just a
 * read-only summary.
 *
 * MOVING THE DATE IS THE NORMAL OUTCOME, NOT A FAILURE. The date exists to
 * create urgency, not to be defended. If coverage looks short in mid-October,
 * moving it is the right call and the copy says so — turning 216 families
 * away on a Sunday morning to keep a date somebody typed in September is the
 * wrong way round.
 *
 * The server refuses a date of today or earlier, so enforcement cannot be
 * switched on by a mistyped date from this screen. It has to be scheduled,
 * which means families get told first.
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
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
import { useToast } from "@/shared/hooks/use-toast";
import { useConsentPolicy, useSetConsentMode } from "../hooks/useConsent";
import { errorMessage } from "../services/rpcError";
import { sundaysBefore } from "../utils/consentSchedule";

interface Props {
  organizationId: string | undefined;
  /** Only a kids_admin may change the rule; everyone else sees it read-only. */
  canEdit?: boolean;
}

function longDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function ConsentRuleCard({ organizationId, canEdit = false }: Props) {
  const { toast } = useToast();
  const { data: policy, isLoading } = useConsentPolicy(organizationId);
  const setMode = useSetConsentMode();
  const [newDate, setNewDate] = useState("");
  const [confirmPause, setConfirmPause] = useState(false);

  if (isLoading || !policy || !organizationId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">The consent rule</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Loading…</CardContent>
      </Card>
    );
  }

  const sundaysLeft = policy.enforce_from
    ? sundaysBefore(policy.enforce_from, new Date())
    : null;

  async function apply(
    mode: "off" | "warn" | "block",
    enforceFrom: string | null,
    said: string,
  ) {
    try {
      await setMode.mutateAsync({ organizationId: organizationId!, mode, enforceFrom });
      toast({ title: said });
      setNewDate("");
    } catch (err) {
      toast({
        variant: "destructive",
        title: "That did not change",
        description: errorMessage(err),
      });
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex flex-wrap items-center gap-2">
          The consent rule
          {policy.enforcing_now ? (
            <Badge variant="destructive">In force</Badge>
          ) : policy.mode === "block" ? (
            <Badge variant="secondary">Scheduled</Badge>
          ) : policy.mode === "warn" ? (
            <Badge variant="outline">Reminder only</Badge>
          ) : (
            <Badge variant="outline">Off</Badge>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4 text-sm">
        {/* What is true right now, in a sentence. */}
        {policy.enforcing_now ? (
          <p>
            A child without a signed form is being turned away at the desk, from{" "}
            {policy.enforce_from ? longDate(policy.enforce_from) : "today"}. A leader
            can still let a family through for one service.
          </p>
        ) : policy.mode === "block" && policy.enforce_from ? (
          <p>
            Every child is being checked in as normal, and the desk is asking families
            to fill the form in. From{" "}
            <span className="font-medium">{longDate(policy.enforce_from)}</span> a child
            without one will be turned away.
            {sundaysLeft !== null && (
              <>
                {" "}
                That is{" "}
                <span className="font-medium tabular-nums">{sundaysLeft}</span>{" "}
                {sundaysLeft === 1 ? "Sunday" : "Sundays"} from now.
              </>
            )}
          </p>
        ) : policy.mode === "warn" ? (
          <p>
            The desk asks every family to fill the form in, and nobody is turned away.
            There is no date set.
          </p>
        ) : (
          <p>The form is not being asked for at all.</p>
        )}

        {policy.updated_by_name && (
          <p className="text-xs text-muted-foreground">
            Last changed by {policy.updated_by_name}.
          </p>
        )}

        {canEdit && (
          <div className="space-y-3 border-t pt-3">
            {/*
              The panic button, first and unmissable when the rule is live.
              Somebody reaching for this has a queue in front of them.
            */}
            {policy.enforcing_now && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
                <p className="font-medium">Is this morning going badly?</p>
                <p className="text-muted-foreground mt-1">
                  Pausing puts every family back to a reminder immediately. Nothing is
                  lost — the signatures already collected stay, and you can set a new
                  date whenever you are ready.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => setConfirmPause(true)}
                  disabled={setMode.isPending}
                >
                  Pause the rule
                </Button>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="enforce">
                {policy.mode === "block" ? "Move the date" : "Set a date"}
              </Label>
              <div className="flex flex-wrap gap-2">
                <Input
                  id="enforce"
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="max-w-[12rem]"
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!newDate || setMode.isPending}
                  onClick={() =>
                    apply(
                      "block",
                      newDate,
                      `The form will be required from ${longDate(newDate)}.`,
                    )
                  }
                >
                  Save
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                It has to be a future date — families need telling first. If coverage
                looks short in October, moving this is the right call rather than
                turning families away to keep it.
              </p>
            </div>

            {policy.mode !== "warn" && !policy.enforcing_now && (
              <Button
                variant="ghost"
                size="sm"
                disabled={setMode.isPending}
                onClick={() =>
                  apply("warn", null, "Back to a reminder, with no date.")
                }
              >
                Cancel the date and just remind
              </Button>
            )}
          </div>
        )}
      </CardContent>

      <AlertDialog open={confirmPause} onOpenChange={setConfirmPause}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pause the consent rule?</AlertDialogTitle>
            <AlertDialogDescription>
              From the moment you confirm, no child is turned away for a missing form.
              The desk goes back to asking. Every signature already collected stays
              exactly as it is, and you can set a new date whenever you want to.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Leave it in force</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                apply("warn", null, "Paused. Nobody is being turned away.")
              }
            >
              Pause it now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
