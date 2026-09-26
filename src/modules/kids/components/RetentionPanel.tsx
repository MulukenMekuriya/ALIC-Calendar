/**
 * How long the church keeps each kind of record, and what is past its date.
 *
 * THE MONTHLY EMAIL POINTS HERE. When anything is past its date the Kids
 * Ministry admins get one note saying so, and it tells them removing the
 * records is a deliberate act somebody has to confirm on this screen. This is
 * that screen.
 *
 * NOTHING ON A SCHEDULE, EVER. The report is a STABLE function server-side,
 * which means Postgres itself forbids it from deleting. The only call that
 * can remove anything is behind the dialog below, needs a reason of at least
 * ten characters, and writes an audit row that outlives the records it
 * removed. A cron job that quietly deletes children's medical records is one
 * bad predicate away from destroying the answer to a question nobody has
 * asked yet, and that failure would be silent and permanent.
 *
 * THE COPY IS DELIBERATELY UNEXCITING. Retention is housekeeping, and a
 * screen that shouts makes somebody hurry — which is the one thing you do not
 * want from the only irreversible button in the module. What it does insist
 * on is naming the count before the confirm, because "remove 142 records" and
 * "remove 2" deserve different amounts of thought.
 */

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import { Archive, Lock, Loader2 } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { useRecordsDue, useConfirmPurge } from "../hooks/useKidsLeader";
import type { RetentionRow } from "../services/kidsLeaderService";
import { errorMessage } from "../services/rpcError";

interface Props {
  organizationId: string | undefined;
  /** Only a kids_admin may remove anything. The server refuses anyone else. */
  canPurge?: boolean;
}

const LABELS: Record<string, string> = {
  safeguarding_report: "Safeguarding reports",
  injury_report: "Injury reports",
  consent_signature: "Consent forms",
  behaviour_report: "Behaviour notes",
  late_collection: "Late collections",
};

function label(t: string): string {
  return LABELS[t] ?? t.replace(/_/g, " ");
}

export function RetentionPanel({ organizationId, canPurge = false }: Props) {
  const { toast } = useToast();
  const [opened, setOpened] = useState(false);
  const { data, isLoading } = useRecordsDue(organizationId, opened);
  const purge = useConfirmPurge();

  const [target, setTarget] = useState<RetentionRow | null>(null);
  const [reason, setReason] = useState("");

  async function onConfirm() {
    if (!target || !organizationId) return;
    try {
      const removed = await purge.mutateAsync({
        organizationId,
        recordType: target.record_type,
        reason: reason.trim(),
      });
      toast({
        title: `${removed} ${removed === 1 ? "record" : "records"} removed`,
        description: "The note you gave is recorded against your name.",
      });
      setTarget(null);
      setReason("");
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Nothing was removed",
        description: errorMessage(err),
      });
    }
  }

  if (!opened) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">What we keep, and for how long</CardTitle>
          <CardDescription>
            The retention schedule, and anything past its date. Nothing is ever
            removed automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => setOpened(true)}>
            <Archive className="h-4 w-4 mr-2" aria-hidden />
            Open the retention schedule
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">What we keep, and for how long</CardTitle>
        <CardDescription>
          Nothing here is removed on a schedule. If something is past its date it
          stays until somebody removes it deliberately, and anything under a legal
          hold stays regardless.
        </CardDescription>
      </CardHeader>

      <CardContent className="p-0">
        {isLoading ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Record</TableHead>
                  <TableHead>We keep it</TableHead>
                  <TableHead className="text-right">Past its date</TableHead>
                  <TableHead className="text-right">On hold</TableHead>
                  <TableHead className="w-40" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data ?? []).map((r) => (
                  <TableRow key={r.record_type}>
                    <TableCell>
                      <span className="font-medium">{label(r.record_type)}</span>
                      {/* The reasoning, in the row. Somebody deciding whether
                          to trust the number should not have to go and find
                          out where it came from. */}
                      <span className="block text-xs text-muted-foreground mt-0.5 max-w-xl">
                        {r.basis}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {r.retain_forever ? (
                        <Badge variant="secondary">
                          <Lock className="h-3 w-3 mr-1" aria-hidden />
                          Always
                        </Badge>
                      ) : (
                        <span className="tabular-nums">{r.retain_years} years</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.retain_forever ? "—" : r.due_count}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {r.held_count}
                    </TableCell>
                    <TableCell>
                      {canPurge && !r.retain_forever && r.due_count > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setTarget(r);
                            setReason("");
                          }}
                        >
                          Review and remove
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <p className="px-6 py-4 text-xs text-muted-foreground">
          Safeguarding reports are never removed. Maryland has no time limit on
          claims arising from child sexual abuse, so there is no date after which
          destroying one would be safe.
        </p>
      </CardContent>

      <AlertDialog open={!!target} onOpenChange={(v) => !v && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {target?.due_count} {label(target?.record_type ?? "").toLowerCase()}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  These are past the {target?.retain_years} years the church agreed
                  to keep them. This cannot be undone.
                </p>
                <p>
                  {target?.held_count ? (
                    <>
                      {target.held_count}{" "}
                      {target.held_count === 1 ? "record is" : "records are"} under a
                      legal hold and will not be touched.
                    </>
                  ) : (
                    "Nothing in this group is under a legal hold."
                  )}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="purge-reason">Why are these being removed?</Label>
            <Input
              id="purge-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Agreed at the ministry meeting on…"
            />
            <p className="text-xs text-muted-foreground">
              Recorded against your name, and kept after the records are gone — it
              is the only thing that will explain this later.
            </p>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Leave them</AlertDialogCancel>
            {/*
              Deliberately NOT an AlertDialogAction: that closes the dialog on
              click, which would dismiss it before the server had answered and
              leave somebody unsure whether anything happened.
            */}
            <Button
              variant="destructive"
              disabled={reason.trim().length < 10 || purge.isPending}
              onClick={onConfirm}
            >
              {purge.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />
              )}
              Remove {target?.due_count}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
