/**
 * Which home cell or Bible study a member belongs to.
 *
 * The 28 groups the church runs came out of the Breeze export; this is where
 * somebody is moved from Pharez to Olney, or added to a cell that was missed.
 * A group itself is created by an admin elsewhere — this picker lists what
 * exists rather than inventing one from a typed name, which is how the
 * ministry list grew four spellings of the same thing.
 *
 * Ends memberships rather than deleting them, matching
 * no_overlapping_group_membership's intent: the fact that somebody attended a
 * cell for two years should outlive their leaving it.
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { BookOpen, Loader2, Plus, X } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import {
  useGroups,
  useAddGroupMembership,
  useEndGroupMembership,
} from "../hooks/useGroups";
import { useMinistryRoles } from "../hooks/useReference";
import type { MemberWithRelations } from "../types";

const DAY_LABEL: Record<string, string> = {
  monday: "Mondays", tuesday: "Tuesdays", wednesday: "Wednesdays",
  thursday: "Thursdays", friday: "Fridays", saturday: "Saturdays",
  sunday: "Sundays",
};

interface GroupsCardProps {
  member: MemberWithRelations;
  organizationId: string | undefined;
  canEdit: boolean;
}

export function GroupsCard({ member, organizationId, canEdit }: GroupsCardProps) {
  const { toast } = useToast();
  const groups = useGroups(organizationId);
  const roles = useMinistryRoles(organizationId);
  const addMembership = useAddGroupMembership();
  const endMembership = useEndGroupMembership();

  const [adding, setAdding] = useState(false);
  const [groupId, setGroupId] = useState("");
  const [roleId, setRoleId] = useState("");

  const current = (member.group_memberships ?? []).filter((g) => !g.end_date);
  const currentGroupIds = new Set(current.map((g) => g.group_id));

  const add = async () => {
    if (!organizationId || !groupId) return;
    // Role is required by the table; default to Member so the common case is
    // two clicks rather than three.
    const fallbackRole =
      roleId || roles.data?.find((r) => r.code === "member")?.id;
    if (!fallbackRole) return;

    try {
      await addMembership.mutateAsync({
        organization_id: organizationId,
        group_id: groupId,
        person_id: member.id,
        role_id: fallbackRole,
      });
      toast({ title: "Added to group" });
      setGroupId("");
      setRoleId("");
      setAdding(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({
        title: "Could not save",
        description: /no_overlapping_group_membership/.test(msg)
          ? "They are already in that group."
          : msg,
        variant: "destructive",
      });
    }
  };

  const remove = async (membershipId: string, name: string) => {
    try {
      await endMembership.mutateAsync({ membershipId, memberId: member.id });
      toast({
        title: `Left ${name}`,
        description: "The record is kept, so past attendance still shows.",
      });
    } catch (e) {
      toast({
        title: "Could not save",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3 flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Home cell / Bible study
          </CardTitle>
          <CardDescription className="text-xs mt-1">
            {groups.data?.length
              ? `${groups.data.length} groups meet in this branch.`
              : "Groups are created by the church office."}
          </CardDescription>
        </div>
        {canEdit && !adding && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {adding && (
          <div className="rounded-md border p-3 space-y-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <Select value={groupId} onValueChange={setGroupId}>
                <SelectTrigger aria-label="Group">
                  <SelectValue placeholder="Which group?" />
                </SelectTrigger>
                <SelectContent>
                  {(groups.data ?? [])
                    .filter((g) => !currentGroupIds.has(g.id))
                    .map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Select value={roleId} onValueChange={setRoleId}>
                <SelectTrigger aria-label="Role in the group">
                  <SelectValue placeholder="As Member" />
                </SelectTrigger>
                <SelectContent>
                  {(roles.data ?? []).map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={add}
                disabled={!groupId || addMembership.isPending}
              >
                {addMembership.isPending && (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                )}
                Add
              </Button>
            </div>
          </div>
        )}

        {current.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Not in a home cell or Bible study group.
          </p>
        ) : (
          <ul className="divide-y">
            {current.map((g) => (
              <li key={g.id} className="flex items-center justify-between py-2 gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{g.group?.name}</p>
                  {g.group?.meeting_day && (
                    <p className="text-xs text-muted-foreground">
                      {DAY_LABEL[g.group.meeting_day] ?? g.group.meeting_day}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge
                    variant={g.role?.is_leadership_role ? "default" : "secondary"}
                  >
                    {g.role?.display_name ?? "Member"}
                  </Badge>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title={`Leave ${g.group?.name ?? "group"}`}
                      onClick={() => remove(g.id, g.group?.name ?? "group")}
                      disabled={endMembership.isPending}
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
