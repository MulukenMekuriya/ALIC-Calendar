/**
 * My children — the record, and the Sundays that have finished.
 *
 * WHAT A PARENT MAY CHANGE HERE. A name, a birthday, a school grade. The grade
 * is the one that earns its place: church.pick_room_for_child reads it FIRST
 * when placing a child in a classroom, so a grade nobody updated in September
 * is a six-year-old sent back to last year's room, and the only people who
 * could update it were four people in an office who do not know when your
 * daughter started first grade.
 *
 * ALLERGIES AND MEDICAL NOTES ARE NOW HERE TOO, behind their own button.
 * This screen used to say they were not, and to tell the desk. That decision
 * was taken deliberately and has now been reversed just as deliberately: the
 * parent is the authoritative source, there were ten medical records on file
 * for 534 children, and section 10 of the church's own consent form already
 * makes it the parent's job to tell us when something changes.
 *
 * It is a separate dialog rather than more fields on the edit form, because
 * the two are not the same act. Correcting a spelling is housekeeping;
 * telling the church about an allergy puts words on a label a volunteer will
 * read, and starts a four-week clock to sign the consent form again. That
 * deserves its own screen that says so.
 *
 * STILL NOT TOUCHED. Who may collect a child. Those are custody records, they
 * sit beside safeguarding decisions, and a parent editing them is a different
 * decision with different stakes.
 *
 * AND NOT REMOVING ANYONE. A child added by mistake is a telephone call to the
 * office; a child silently removed from a household is not discoverable at
 * all, and the household is what the check-in desk builds the collection list
 * from.
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
import { Baby, HeartPulse, Pencil, UserPlus } from "lucide-react";
import { usePersonPhotos, primaryPhotoUrl } from "@/modules/members/hooks";
import { PersonAvatar } from "@/modules/members/components";
import { useMyHouseholdDetail } from "../hooks";
import { ChildDialog } from "./ChildDialog";
import { ChildMedicalDialog } from "./ChildMedicalDialog";
import type { MyChild, MyChildCheckIn } from "../types";

interface ChildrenTabProps {
  children: MyChild[] | undefined;
  checkIns: MyChildCheckIn[] | undefined;
  organizationId: string | undefined;
  enabled?: boolean;
}

export function ChildrenTab({
  children,
  checkIns,
  organizationId,
  enabled = true,
}: ChildrenTabProps) {
  const { data: details } = useMyHouseholdDetail(enabled);
  const editable = details?.find((h) => h.i_can_edit);
  /*
   * One request for every child on the page. A child's photo is only visible
   * at all once consent is on record — which uploading it here is what sets —
   * so a face missing from this list is a face nobody else can see either.
   */
  const { data: photos } = usePersonPhotos(
    (children ?? []).map((c) => c.person_id),
    enabled
  );
  /*
   * One dialog, two jobs. `editing` holds the child being corrected, or null
   * for a new one — the same distinction ChildDialog itself draws, so the two
   * cannot get out of step.
   */
  const [editing, setEditing] = useState<MyChild | null>(null);
  const [open, setOpen] = useState(false);
  const [medicalFor, setMedicalFor] = useState<MyChild | null>(null);

  const openFor = (child: MyChild | null) => {
    setEditing(child);
    setOpen(true);
  };

  const hasChildren = (children?.length ?? 0) > 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3 gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Baby className="h-4 w-4" />
              My children
            </CardTitle>
            <CardDescription>
              Keeping the school grade current is what puts a child in the right
              classroom on Sunday.
            </CardDescription>
          </div>
          {editable && (
            <Button
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => openFor(null)}
            >
              <UserPlus className="h-3.5 w-3.5 mr-1" />
              Add a child
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {!hasChildren ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
              No children are recorded in your household yet. Add one here, or
              the check-in desk can do it on Sunday.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>Born</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {children!.map((child) => (
                  <TableRow key={child.person_id}>
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-2.5">
                        <PersonAvatar
                          url={primaryPhotoUrl(photos, child.person_id)}
                          name={child.display_name}
                          size="sm"
                        />
                        <span>
                          {child.display_name}
                          {child.preferred_name && (
                            <span className="text-muted-foreground font-normal">
                              {" "}
                              ({child.preferred_name})
                            </span>
                          )}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell>
                      {child.grade_name ?? (
                        /* Not "—". A missing grade is the one gap on this
                           screen with a consequence on Sunday, so it asks. */
                        <Badge variant="outline">Not set</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {child.birth_year ?? "—"}
                    </TableCell>
                    <TableCell>
                      {editable && (
                        /* flex-nowrap: this row has clipped off both edges at
                           phone width before, on the check-in screen, for
                           exactly this reason. */
                        <span className="flex flex-nowrap items-center gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title={`Health and allergies for ${child.display_name}`}
                            onClick={() => setMedicalFor(child)}
                          >
                            <HeartPulse className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title={`Edit ${child.display_name}`}
                            onClick={() => openFor(child)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recent Sundays</CardTitle>
          <CardDescription>
            Check-ins that have finished, and who collected them. For where a
            child is right now, ask at the check-in desk.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {(checkIns?.length ?? 0) === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
              No check-ins recorded yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Child</TableHead>
                    <TableHead>Room</TableHead>
                    <TableHead>Collected by</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {checkIns!.map((row) => (
                    <TableRow key={row.check_in_id}>
                      <TableCell className="whitespace-nowrap">
                        {row.session_date}
                        <span className="block text-xs text-muted-foreground">
                          {row.service_label}
                        </span>
                      </TableCell>
                      <TableCell>{row.child_name}</TableCell>
                      <TableCell>{row.room_name ?? "—"}</TableCell>
                      <TableCell>
                        {row.picked_up_by_name ?? <Badge variant="outline">{row.status}</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {medicalFor && (
        <ChildMedicalDialog
          open={!!medicalFor}
          onOpenChange={(v) => !v && setMedicalFor(null)}
          childPersonId={medicalFor.person_id}
          childName={medicalFor.preferred_name || medicalFor.display_name}
        />
      )}

      {editable && (
        <ChildDialog
          child={editing}
          householdId={editable.household_id}
          organizationId={organizationId}
          open={open}
          onOpenChange={setOpen}
        />
      )}
    </div>
  );
}
