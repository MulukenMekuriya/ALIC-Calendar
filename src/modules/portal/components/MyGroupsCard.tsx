/**
 * The groups you belong to, when they meet, and how to join one.
 *
 * Lives on My details, beside Where I serve: a group membership and a ministry
 * assignment are the same kind of fact about a person, and both are what the
 * overview's tiles count — a tile that counts something has to lead somewhere
 * the thing it counts is actually written down.
 *
 * The meeting day, time and place are the reason to read it. "Groups: 1" tells
 * a member something they already know; "Wednesdays at 7 PM · Fellowship Hall"
 * is what they would otherwise have to text somebody to find out.
 *
 * JOINING IS NEW, AND IS A REVERSAL. members/services/groupService.ts says an
 * ordinary member cannot add themselves to a group, "which cell someone
 * belongs to is the church's record, not a self-service preference". The cost
 * of that position is visible in the data: the Bible-study rosters are
 * whatever the Breeze export said in August, because the only people who can
 * write them are the ones who do not attend. A membership somebody states
 * about themselves is better evidence than one nobody states at all, and the
 * row is kept when they leave, so the history survives being wrong.
 *
 * WHAT THE JOIN LIST WITHHOLDS. groups.location is free text and in this
 * church it is usually a family's home address. church.my_group_options
 * returns the room name and not the location; the address appears once you are
 * in the group. A member who wants the address of a cell they have not joined
 * asks somebody, which is how they would have found out anyway.
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
import { Loader2, Plus, Users, X } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { useMyGroups, useMyGroupOptions, useJoinGroup, useLeaveGroup } from "../hooks";
import { describeMeeting } from "../utils/whenIsIt";
import { sayWhyNot } from "../utils/sayWhyNot";

interface MyGroupsCardProps {
  organizationId: string | undefined;
  enabled?: boolean;
}

export function MyGroupsCard({ organizationId, enabled = true }: MyGroupsCardProps) {
  const { toast } = useToast();
  const { data: groups } = useMyGroups(enabled);
  const [joining, setJoining] = useState(false);
  const { data: options, isLoading: optionsLoading } = useMyGroupOptions(
    organizationId,
    enabled && joining
  );
  const [groupId, setGroupId] = useState("");

  const join = useJoinGroup();
  const leave = useLeaveGroup();

  const fail = (e: unknown) =>
    toast({ title: "Not saved", description: sayWhyNot(e), variant: "destructive" });

  const joinGroup = async () => {
    if (!groupId) return;
    const name = options?.find((o) => o.group_id === groupId)?.name ?? "the group";
    try {
      await join.mutateAsync(groupId);
      toast({
        title: `You are in ${name}`,
        description: "Where and when it meets is now on this page.",
      });
      setGroupId("");
      setJoining(false);
    } catch (e) {
      fail(e);
    }
  };

  const leaveGroup = async (membershipId: string, name: string) => {
    try {
      await leave.mutateAsync(membershipId);
      toast({
        title: `You have left ${name}`,
        description: "The record is kept, so last year's roster is still right.",
      });
    } catch (e) {
      fail(e);
    }
  };

  const unjoined = (options ?? []).filter((o) => !o.already_member);

  return (
    <Card>
      <CardHeader className="pb-3 gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Your groups
          </CardTitle>
          <CardDescription>
            Home cells, Bible studies and discipleship groups you are a current
            member of.
          </CardDescription>
        </div>
        {!joining && (
          <Button
            variant="outline"
            size="sm"
            className="w-full sm:w-auto"
            onClick={() => setJoining(true)}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Join
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {joining && (
          <div className="rounded-md border p-3 space-y-2">
            <Select value={groupId} onValueChange={setGroupId}>
              <SelectTrigger aria-label="Group">
                <SelectValue placeholder="Which group?" />
              </SelectTrigger>
              <SelectContent>
                {/* An empty array means "none left" and "not arrived yet"
                    equally well, and only one of those is worth saying. */}
                {optionsLoading ? (
                  <div className="px-2 py-3 text-sm text-muted-foreground">Loading…</div>
                ) : unjoined.length === 0 ? (
                  <div className="px-2 py-3 text-sm text-muted-foreground">
                    No other groups are listed. The office can tell you which is
                    nearest.
                  </div>
                ) : (
                  unjoined.map((o) => {
                    const meeting = describeMeeting(o.meeting_day, o.meeting_time, o.room_name);
                    return (
                      <SelectItem key={o.group_id} value={o.group_id}>
                        {o.name}
                        <span className="text-muted-foreground">
                          {meeting ? ` · ${meeting}` : ` · ${o.group_type}`}
                        </span>
                      </SelectItem>
                    );
                  })
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Joining records that you attend. The group's leader is set by the
              church office.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setJoining(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={joinGroup} disabled={!groupId || join.isPending}>
                {join.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                Join
              </Button>
            </div>
          </div>
        )}

        {(groups?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">
            You are not in a group yet. There is one most evenings of the week —
            Join above, or the office can tell you which is nearest.
          </p>
        ) : (
          groups!.map((group) => {
            const meeting = describeMeeting(
              group.meeting_day,
              group.meeting_time,
              group.meeting_place
            );
            return (
              <div key={group.membership_id} className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{group.group_name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {/* The type is the fallback, not an addition: "Home Cell"
                        under a group called "Wheaton Home Cell" is noise, and
                        it is only worth the line when nothing better is set. */}
                    {meeting || group.group_type}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {group.is_leadership_role && (
                    <Badge variant="secondary" className="shrink-0">
                      leads
                    </Badge>
                  )}
                  {/* A leader has no Leave button: church.leave_group refuses
                      it, because a group losing its leader is not a change one
                      form should make quietly. */}
                  {!group.is_leadership_role && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title={`Leave ${group.group_name}`}
                      onClick={() => leaveGroup(group.membership_id, group.group_name)}
                      disabled={leave.isPending}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
