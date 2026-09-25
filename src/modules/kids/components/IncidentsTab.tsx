/**
 * The incident review queue.
 *
 * A teacher's account arrives here. A Kids Ministry leader reads it, asks
 * questions if they need to, decides how serious it is, and signs it off.
 *
 * THREE THINGS THIS SCREEN IS CAREFUL ABOUT.
 *
 * The teacher's words are quoted, never edited. reported_narrative is
 * immutable in the database; what the leader writes goes in a separate field.
 * The screen shows that distinction rather than hiding it, because in a year
 * somebody will need to know who wrote which sentence.
 *
 * Opening a report is audited. The list carries no narrative at all, so
 * working through the queue records nothing; only opening one writes a
 * sensitive_viewed row naming the child. That is why the detail query does not
 * refetch on focus — a refetch is a read somebody did not perform.
 *
 * A safeguarding report cannot be signed off or declined until somebody has
 * recorded whether it was reported to the authorities. "No" is a valid answer.
 * The database enforces this; the screen explains it rather than surfacing a
 * constraint violation.
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
import { Switch } from "@/shared/components/ui/switch";
import { Input } from "@/shared/components/ui/input";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { AlertTriangle, Loader2, ShieldAlert, X } from "lucide-react";
import { toast } from "sonner";
import {
  useIncidentQueue,
  useIncidentDetail,
  useReviewIncident,
  useSignOffIncident,
  useDeclineIncident,
  useRecordExternalReport,
} from "../hooks/useKidsLeader";
import type { IncidentQueueRow } from "../services/kidsLeaderService";
import { errorMessage, isDbError } from "../services/rpcError";

const SEVERITY: Record<
  string,
  { label: string; variant: "destructive" | "secondary" | "outline" }
> = {
  safeguarding: { label: "Safeguarding", variant: "destructive" },
  injury: { label: "Injury", variant: "destructive" },
  behaviour: { label: "Behaviour", variant: "secondary" },
};

interface IncidentsTabProps {
  organizationId: string | undefined;
}

export function IncidentsTab({ organizationId }: IncidentsTabProps) {
  const [showSettled, setShowSettled] = useState(false);
  const { data, isLoading } = useIncidentQueue(organizationId, showSettled);
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = data ?? [];
  const unanswered = rows.filter((r) => r.needs_reporting_answer);
  const waiting = rows.filter((r) => r.status === "submitted").length;

  return (
    <>
      <div className="space-y-4">
        {unanswered.length > 0 && (
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertDescription>
              {unanswered.length} safeguarding report
              {unanswered.length === 1 ? "" : "s"} with no record of whether the
              authorities were told. Reporting is not something this system does
              for you, and it is not something you need permission for.
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Incident reports</CardTitle>
              <CardDescription>
                {rows.length === 0
                  ? "Nothing to review."
                  : `${rows.length} report${rows.length === 1 ? "" : "s"}, ${waiting} not yet picked up.`}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="show-settled" className="text-xs">
                Include settled
              </Label>
              <Switch
                id="show-settled"
                checked={showSettled}
                onCheckedChange={setShowSettled}
              />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No incident reports. Teachers raise these from the check-in
                station.
              </p>
            ) : (
              <div className="space-y-2">
                {rows.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => setOpenId(row.id)}
                    className="flex w-full flex-wrap items-center gap-2 rounded-md border p-3 text-left hover:bg-muted/50"
                  >
                    <Badge variant={SEVERITY[row.severity]?.variant ?? "outline"}>
                      {SEVERITY[row.severity]?.label ?? row.severity}
                    </Badge>
                    {row.needs_reporting_answer && (
                      <Badge variant="destructive" className="gap-1">
                        <ShieldAlert className="h-3 w-3" />
                        Not answered
                      </Badge>
                    )}
                    <span className="text-sm font-medium">{row.child_name}</span>
                    {row.room_name && (
                      <span className="text-xs text-muted-foreground">
                        {row.room_name}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      by {row.reported_by_name}
                    </span>
                    {row.status !== "submitted" && (
                      <Badge variant="outline">
                        {row.status.replace(/_/g, " ")}
                      </Badge>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {row.occurred_on}
                      {row.status === "submitted" && row.age_hours >= 24 && (
                        <span className="ml-2 text-amber-700 dark:text-amber-500">
                          waiting {Math.floor(row.age_hours / 24)}d
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <IncidentDialog
        id={openId}
        organizationId={organizationId}
        onClose={() => setOpenId(null)}
      />
    </>
  );
}

/** One report, opened. This is the audited read. */
function IncidentDialog({
  id,
  organizationId,
  onClose,
}: {
  id: string | null;
  organizationId: string | undefined;
  onClose: () => void;
}) {
  const { data: incident, isLoading } = useIncidentDetail(id);
  const review = useReviewIncident(organizationId);
  const signOff = useSignOffIncident(organizationId);
  const decline = useDeclineIncident(organizationId);
  const record = useRecordExternalReport(organizationId);

  const [summary, setSummary] = useState("");
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [reportNote, setReportNote] = useState("");
  const [reportRef, setReportRef] = useState("");

  const settled =
    incident?.status === "signed_off" ||
    incident?.status === "sent" ||
    incident?.status === "declined";
  const needsAnswer =
    incident?.severity === "safeguarding" && incident?.external_report_made === null;

  return (
    <Dialog open={id !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        {isLoading || !incident ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                <Badge variant={SEVERITY[incident.severity]?.variant ?? "outline"}>
                  {SEVERITY[incident.severity]?.label ?? incident.severity}
                </Badge>
                {incident.child_name}
              </DialogTitle>
              <DialogDescription>
                {incident.occurred_on}
                {incident.room_name ? ` · ${incident.room_name}` : ""} · reported
                by {incident.reported_by_name}
              </DialogDescription>
            </DialogHeader>

            {/* The teacher's own words, quoted and attributed. Never editable. */}
            <div className="rounded-md border-l-4 border-muted-foreground/40 bg-muted/40 p-3">
              <p className="whitespace-pre-wrap text-sm">
                {incident.reported_narrative}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {incident.reported_by_name}, as written. This cannot be edited.
              </p>
            </div>

            {incident.severity === "safeguarding" && (
              <Alert variant={needsAnswer ? "destructive" : "default"}>
                <ShieldAlert className="h-4 w-4" />
                <AlertDescription className="space-y-2">
                  <p>
                    If you believe a child has been harmed or is at risk,
                    reporting to the authorities is not something this form does
                    for you, and it is not something you need permission for.
                  </p>
                  {incident.external_report_made === null ? (
                    <div className="space-y-2 pt-1">
                      <Label className="text-xs">
                        Has this been reported to the authorities?
                      </Label>
                      <Input
                        placeholder="Reference, if there is one"
                        value={reportRef}
                        onChange={(e) => setReportRef(e.target.value)}
                      />
                      <Textarea
                        rows={2}
                        placeholder="If not reported, say why (required)"
                        value={reportNote}
                        onChange={(e) => setReportNote(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={async () => {
                            try {
                              await record.mutateAsync({
                                id: incident.id, made: true,
                                reference: reportRef.trim() || null,
                                note: reportNote.trim() || null,
                              });
                              toast.success("Recorded as reported");
                            } catch (err) {
                              toast.error("Could not record", {
                                description: errorMessage(err),
                              });
                            }
                          }}
                        >
                          Yes, it was reported
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={reportNote.trim().length < 10}
                          onClick={async () => {
                            try {
                              await record.mutateAsync({
                                id: incident.id, made: false,
                                note: reportNote.trim(),
                              });
                              toast.success("Recorded");
                            } catch (err) {
                              toast.error("Could not record", {
                                description: errorMessage(err),
                              });
                            }
                          }}
                        >
                          No — reason given
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs">
                      {incident.external_report_made
                        ? `Reported${incident.external_report_reference ? ` · ${incident.external_report_reference}` : ""}`
                        : `Not reported — ${incident.external_report_note}`}
                    </p>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {settled ? (
              <div className="space-y-1 text-sm">
                <p className="font-medium">
                  {incident.status === "declined" ? "Declined" : "Signed off"} by{" "}
                  {incident.signed_off_by_name}
                </p>
                {incident.admin_summary && (
                  <p className="text-muted-foreground">{incident.admin_summary}</p>
                )}
                {incident.decline_reason && (
                  <p className="text-muted-foreground">
                    {incident.decline_reason}
                  </p>
                )}
                {/* Sending to the family is a separate step, and never offered
                    for a safeguarding report - the parent may be the concern. */}
                {incident.severity !== "safeguarding" && !incident.sent_at && (
                  <p className="pt-1 text-xs text-muted-foreground">
                    The family has not been told. That is a separate step.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="admin-summary">
                  Your own note (kept separate from the teacher's)
                </Label>
                <Textarea
                  id="admin-summary"
                  rows={4}
                  value={summary}
                  placeholder="What you looked into, what you decided."
                  onChange={(e) => setSummary(e.target.value)}
                />
              </div>
            )}

            {!settled && (
              <DialogFooter className="flex-wrap gap-2">
                {incident.status === "submitted" && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      review.mutateAsync({ id: incident.id }).catch(() => {})
                    }
                  >
                    Pick up
                  </Button>
                )}
                <Button
                  variant="ghost"
                  onClick={() => setDeclining(true)}
                >
                  <X className="h-4 w-4" />
                  Decline
                </Button>
                <Button
                  disabled={signOff.isPending || needsAnswer}
                  onClick={async () => {
                    try {
                      await signOff.mutateAsync({
                        id: incident.id,
                        adminSummary: summary.trim() || null,
                      });
                      toast.success("Signed off");
                      onClose();
                    } catch (err) {
                      toast.error("Could not sign off", {
                        description: isDbError(err, "reporting_answer_required")
                          ? "Record whether this was reported first. \"No\" is a valid answer."
                          : errorMessage(err),
                      });
                    }
                  }}
                >
                  Sign off
                </Button>
              </DialogFooter>
            )}

            {needsAnswer && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Answer the reporting question above before signing off.
              </p>
            )}

            <Dialog open={declining} onOpenChange={setDeclining}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Decline this report</DialogTitle>
                  <DialogDescription>
                    The teacher who wrote it will read your reason. The report
                    stays on the child's record either way.
                  </DialogDescription>
                </DialogHeader>
                <Textarea
                  rows={3}
                  value={reason}
                  placeholder="Spoke with the teacher; handled at the door."
                  onChange={(e) => setReason(e.target.value)}
                />
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDeclining(false)}>
                    Cancel
                  </Button>
                  <Button
                    disabled={reason.trim().length < 5 || decline.isPending}
                    onClick={async () => {
                      try {
                        await decline.mutateAsync({
                          id: incident.id,
                          reason: reason.trim(),
                        });
                        toast.success("Declined");
                        setDeclining(false);
                        onClose();
                      } catch (err) {
                        toast.error("Could not decline", {
                          description: isDbError(err, "reporting_answer_required")
                            ? "Record whether this was reported first."
                            : errorMessage(err),
                        });
                      }
                    }}
                  >
                    Decline
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
