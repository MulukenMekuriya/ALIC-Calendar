/**
 * Where I serve — read from the church's own record, and kept by the member.
 *
 * This card replaces the one MyInformation renders on /members, for a reason
 * worth writing down: that one reads church.ministry_assignments straight from
 * the table and then looks the NAMES up in budget.ministries, which carries a
 * RESTRICTIVE policy shutting a plain member out ("Members cannot reach
 * ministries without a grant", 20260321001600). A member therefore saw their
 * two assignments rendered as "Unknown ministry" twice — the church knew where
 * they served and could not tell them. church.my_serving() is a definer over
 * the same rows and returns the four words.
 *
 * WHAT A MEMBER MAY SAY HERE. That they serve somewhere, and that they have
 * stopped. Not that they lead: the role is chosen inside church.join_ministry
 * and never passed in, so the leadership reports cannot be written into from a
 * browser. A member who already holds a leadership role gets no "step down"
 * button, because a ministry losing its leader is a conversation, not a form
 * submission — church.leave_ministry refuses it too.
 *
 * ENDING, NOT DELETING. church.ministry_assignments keeps ended rows (BR-11),
 * so somebody who led worship for six years still reads that way afterwards.
 * The row simply drops off this list, which asks for current service.
 */

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { HandHeart, Loader2, Plus, X } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import {
  useMyServing,
  useMyMinistryOptions,
  useJoinMinistry,
  useLeaveMinistry,
} from "../hooks";
import { sayWhyNot } from "../utils/sayWhyNot";

interface MyServingCardProps {
  organizationId: string | undefined;
  enabled?: boolean;
}

export function MyServingCard({ organizationId, enabled = true }: MyServingCardProps) {
  const { toast } = useToast();
  const { data: serving, isLoading } = useMyServing(enabled);
  const [adding, setAdding] = useState(false);
  // The picker is a list of every ministry in the branch, so it is not fetched
  // until somebody asks to see it.
  const { data: options, isLoading: optionsLoading } = useMyMinistryOptions(
    organizationId,
    enabled && adding
  );
  const [ministryId, setMinistryId] = useState("");

  const join = useJoinMinistry();
  const leave = useLeaveMinistry();

  const fail = (e: unknown) =>
    toast({ title: "Not saved", description: sayWhyNot(e), variant: "destructive" });

  const addMinistry = async () => {
    if (!ministryId) return;
    const name = options?.find((o) => o.ministry_id === ministryId)?.name ?? "the ministry";
    try {
      await join.mutateAsync(ministryId);
      toast({
        title: `Recorded: you serve in ${name}`,
        description: "The office can change your role if it is not right.",
      });
      setMinistryId("");
      setAdding(false);
    } catch (e) {
      fail(e);
    }
  };

  const stopServing = async (assignmentId: string, name: string) => {
    try {
      await leave.mutateAsync(assignmentId);
      toast({
        title: `No longer serving in ${name}`,
        description: "The record is kept, so your service history survives.",
      });
    } catch (e) {
      fail(e);
    }
  };

  const unjoined = (options ?? []).filter((o) => !o.already_serving);

  return (
    <Card>
      <CardHeader className="pb-3 flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <HandHeart className="h-4 w-4" />
            Where I serve
          </CardTitle>
          <CardDescription>
            Add a ministry you help with. The church office sets the role and
            can correct anything here.
          </CardDescription>
        </div>
        {!adding && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {adding && (
          <div className="rounded-md border p-3 space-y-2">
            <Select value={ministryId} onValueChange={setMinistryId}>
              <SelectTrigger aria-label="Ministry">
                <SelectValue placeholder="Which ministry?" />
              </SelectTrigger>
              <SelectContent>
                {/* "Nothing left to add" and "not loaded yet" look identical
                    from an empty array, and telling a member there is nothing
                    when the list simply has not arrived is the worse of the
                    two mistakes. */}
                {optionsLoading ? (
                  <div className="px-2 py-3 text-sm text-muted-foreground">Loading…</div>
                ) : unjoined.length === 0 ? (
                  <div className="px-2 py-3 text-sm text-muted-foreground">
                    Nothing left to add — you are recorded in every ministry on
                    the list.
                  </div>
                ) : (
                  unjoined.map((o) => (
                    <SelectItem key={o.ministry_id} value={o.ministry_id}>
                      {o.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={addMinistry} disabled={!ministryId || join.isPending}>
                {join.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                Add
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (serving?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing recorded yet. If you already help somewhere, add it here so
            the church has it written down.
          </p>
        ) : (
          <ul className="divide-y">
            {serving!.map((row) => (
              <li key={row.assignment_id} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{row.ministry_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {/* The date the church last confirmed this, which for the
                        imported rows is the day of the export and not the day
                        anybody began serving. Said as "recorded" for exactly
                        that reason. */}
                    Recorded since {row.start_date}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge variant={row.is_leadership_role ? "default" : "secondary"}>
                    {row.role_name}
                  </Badge>
                  {!row.is_leadership_role && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title={`I no longer serve in ${row.ministry_name}`}
                      onClick={() => stopServing(row.assignment_id, row.ministry_name)}
                      disabled={leave.isPending}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
