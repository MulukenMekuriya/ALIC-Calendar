/**
 * My household — who is in it, where it is, and what a member may change.
 *
 * The tab used to open with a sentence that was half true:
 *
 *     "To change anything here, speak to the church office — a household is
 *      shared, so it is not edited from one person's login."
 *
 * Shared is right about the ROSTER. Adding an adult to a household is not an
 * address change: church.station_pickup_candidates builds the collection
 * screen for a child from their household, and church.notify_parents mails
 * that household about check-in, so "add my brother" would quietly hand a
 * third party the right to collect a child. That stays with the office.
 *
 * It was never right about the address. The family knows where it lives and
 * the office learns it last — usually from a returned envelope. So the address
 * and the telephone number are editable by any adult of the household, and the
 * sentence now says which half is which.
 *
 * Children are added here as well as on My children, because "we have had a
 * baby" is a thought somebody has while looking at a list of their family, not
 * while looking at a list of Sunday check-ins.
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
import { Home, MapPin, Pencil, Phone, UserPlus } from "lucide-react";
import { useMyHouseholdDetail } from "../hooks";
import { HouseholdDialog } from "./HouseholdDialog";
import { ChildDialog } from "./ChildDialog";
import type { HouseholdMemberRow } from "../types";

interface HouseholdTabProps {
  household: HouseholdMemberRow[] | undefined;
  organizationId: string | undefined;
  enabled?: boolean;
}

export function HouseholdTab({ household, organizationId, enabled = true }: HouseholdTabProps) {
  const { data: details } = useMyHouseholdDetail(enabled);
  const [addingChild, setAddingChild] = useState(false);

  /*
   * church.my_household_detail returns a SET, because a person can belong to
   * more than one household — a student living between two families is the
   * case it was written for. So the Edit button holds the id of the household
   * it belongs to rather than a bare true/false: with two editable households
   * a boolean would open the first one's address under the second one's
   * heading, and the save would go to the wrong family.
   */
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = details?.find((h) => h.household_id === editingId) ?? null;

  /*
   * "Add a child" is one button over a roster that spans every household, so
   * unlike Edit it cannot be per-row. It adds to the first household the
   * member may edit, which for all but a handful of people is their only one.
   */
  const editable = details?.find((h) => h.i_can_edit);

  return (
    <div className="space-y-4">
      {(details ?? []).map((detail) => {
        const address = [
          detail.address_line1,
          detail.address_line2,
          [detail.city, detail.state].filter(Boolean).join(", "),
          detail.postal_code,
        ]
          .filter(Boolean)
          .join(" · ");

        return (
          <Card key={detail.household_id}>
            <CardHeader className="pb-3 flex-row items-start justify-between space-y-0 gap-3">
              <div className="min-w-0">
                <CardTitle className="text-base flex items-center gap-2">
                  <Home className="h-4 w-4" />
                  {detail.name}
                </CardTitle>
                <CardDescription>
                  The address the church writes to and the number it rings. To
                  add or remove an adult, speak to the church office — a
                  household is shared, and who is in it decides who may collect
                  a child.
                </CardDescription>
              </div>
              {detail.i_can_edit && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingId(detail.household_id)}
                >
                  <Pencil className="h-3.5 w-3.5 mr-1" />
                  Edit
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-1.5">
              <p className="text-sm flex items-start gap-2">
                <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                {address || (
                  <span className="text-muted-foreground">
                    No address on record. Adding one is how the church knows
                    where to send a statement.
                  </span>
                )}
              </p>
              <p className="text-sm flex items-center gap-2">
                <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
                {detail.primary_phone ?? (
                  <span className="text-muted-foreground">No household number on record.</span>
                )}
              </p>
            </CardContent>
          </Card>
        );
      })}

      <Card>
        <CardHeader className="pb-3 flex-row items-start justify-between space-y-0 gap-3">
          <div>
            <CardTitle className="text-base">Who is in it</CardTitle>
            <CardDescription>
              Everyone currently recorded at this address.
            </CardDescription>
          </div>
          {editable && (
            <Button variant="outline" size="sm" onClick={() => setAddingChild(true)}>
              <UserPlus className="h-3.5 w-3.5 mr-1" />
              Add a child
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {(household?.length ?? 0) === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
              You are not recorded in a household yet. The church office can put
              that right.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Contact</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {household!.map((person) => (
                  <TableRow key={person.person_id}>
                    <TableCell>
                      <span className="font-medium">{person.display_name}</span>
                      {person.is_me && <Badge className="ml-2">you</Badge>}
                      {person.is_child && (
                        <Badge variant="secondary" className="ml-2">
                          child
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="capitalize">
                      {person.household_role ?? "—"}
                      {person.is_primary_contact && (
                        <span className="block text-xs text-muted-foreground">
                          primary contact
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {person.phone ?? person.email ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {editing && (
        <HouseholdDialog
          household={editing}
          open
          onOpenChange={(next) => !next && setEditingId(null)}
        />
      )}

      {editable && (
        <ChildDialog
          child={null}
          householdId={editable.household_id}
          organizationId={organizationId}
          open={addingChild}
          onOpenChange={setAddingChild}
        />
      )}
    </div>
  );
}
