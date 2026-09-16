/**
 * My record in the church directory, and the button that corrects it.
 *
 * WHY THE PORTAL DRAWS THIS ITSELF rather than rendering members/MyInformation
 * the way it used to. That component is three cards — the record, the
 * household, and where I serve — and on this page two of the three were wrong
 * by the time they arrived:
 *
 *   * ITS HOUSEHOLD CARD duplicated the My household tab, listing the same
 *     people a tab away from the fuller version of itself.
 *
 *   * ITS SERVING CARD read church.ministry_assignments directly and then
 *     looked the NAMES up in budget.ministries — which carries a RESTRICTIVE
 *     policy shutting a plain member out ("Members cannot reach ministries
 *     without a grant", 20260321001600). So a member saw their own two
 *     assignments rendered as "Unknown ministry" twice: the church knew where
 *     they served and could not tell them. MyServingCard reads
 *     church.my_serving(), a definer over the same rows, and gets the names.
 *
 * MyInformation is untouched and still serves /members, where the reader is
 * staff and both of those problems are already absent.
 *
 * The EDIT dialog is shared, deliberately: MemberDetailsDialog is the same
 * form the office uses with the office-only fields hidden, and what a member
 * may actually change is enforced again in church.update_person_details. One
 * field list, one set of rules — a second, narrower form here is how the two
 * would drift.
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
import { Loader2, Pencil, UserRound } from "lucide-react";
import { useMyRecord } from "@/modules/members/hooks";
import { MemberDetailsDialog } from "@/modules/members/components";
import { displayName } from "@/modules/members/utils";
import { formatBirthday, formatAge, yearsSinceAccepted } from "@/modules/members/utils";

export function MyRecordCard({ userId }: { userId: string | undefined }) {
  const recordQuery = useMyRecord(userId);
  const me = recordQuery.data;
  const [isEditOpen, setIsEditOpen] = useState(false);

  if (recordQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // The tabs only render for a linked login, so this is the momentary state
  // between the summary arriving and the person row landing, not the "we have
  // not linked you" case the page handles above.
  if (!me) return null;

  const acceptedYears = yearsSinceAccepted(me.accepted_lord_year, me.accepted_lord_month);

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <UserRound className="h-4 w-4" />
                {displayName(me)}
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                Your record in the church directory
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => setIsEditOpen(true)}>
              <Pencil className="h-3.5 w-3.5 mr-1" />
              Edit contact
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Field label="Phone" value={me.phone ?? "—"} />
          <Field label="Email" value={me.email ?? "—"} />
          <Field label="Birthday" value={formatBirthday(me)} />
          <Field label="Age" value={formatAge(me)} />
          {me.member_since && <Field label="Member since" value={me.member_since} />}
          {acceptedYears !== null && (
            <Field label="Years since accepting the Lord" value={String(acceptedYears)} />
          )}
        </CardContent>
      </Card>

      <MemberDetailsDialog
        member={me}
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        canAdmin={false}
        organizationId={me.organization_id}
      />
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium mt-0.5">{value}</p>
    </div>
  );
}
