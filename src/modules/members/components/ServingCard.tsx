/**
 * Ministry service for one member, and the ministries they would like to join.
 *
 * The lists were read-only until now: 264 assignments arrived from the Breeze
 * export and there was no way to add the 265th, end one, or record that
 * somebody had asked to help with Media. Both halves are editable here.
 *
 * ENDING, NOT DELETING. church.ministry_assignments keeps ended rows on
 * purpose (BR-11 / MIN-008) so service history survives — somebody who led
 * Worship for six years should still read that way after they stop. "Remove"
 * therefore sets end_date, and the row drops off this list because the list
 * asks for current service.
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
import { HandHeart, Loader2, Plus, X } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { useMemberServing } from "../hooks/useServing";
import {
  useCreateAssignment,
  useEndAssignment,
  useCreateServiceInterest,
} from "../hooks/useServing";
import { useMinistries, useMinistryRoles } from "../hooks/useReference";
import { SERVICE_INTEREST_STATUS_CONFIG } from "../types";
import type { MemberWithRelations } from "../types";

interface ServingCardProps {
  member: MemberWithRelations;
  organizationId: string | undefined;
  canEdit: boolean;
}

export function ServingCard({ member, organizationId, canEdit }: ServingCardProps) {
  const { toast } = useToast();
  const servingQuery = useMemberServing(member.id);
  const ministries = useMinistries(organizationId);
  const roles = useMinistryRoles(organizationId);

  const createAssignment = useCreateAssignment();
  const endAssignment = useEndAssignment();
  const createInterest = useCreateServiceInterest();

  const [addingService, setAddingService] = useState(false);
  const [ministryId, setMinistryId] = useState("");
  const [roleId, setRoleId] = useState("");

  const [addingInterest, setAddingInterest] = useState(false);
  const [interestMinistryId, setInterestMinistryId] = useState("");

  const assignments = servingQuery.data ?? [];
  const serving = assignments.filter((a) => !a.end_date);

  /** Already serving here, so the picker should not offer it again. */
  const servingMinistryIds = new Set(serving.map((a) => a.ministry_id));
  const interestMinistryIds = new Set(
    (member.service_interests ?? []).map((i) => i.ministry_id)
  );

  const fail = (e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    toast({
      title: "Could not save",
      // The EXCLUDE constraint is the likely one, and its message is opaque.
      description: /no_overlapping_ministry_assignment/.test(msg)
        ? "They already hold that role in that ministry."
        : /uq_service_interests/.test(msg)
          ? "That interest is already recorded."
          : msg,
      variant: "destructive",
    });
  };

  const addService = async () => {
    if (!organizationId || !ministryId || !roleId) return;
    try {
      await createAssignment.mutateAsync({
        organization_id: organizationId,
        person_id: member.id,
        ministry_id: ministryId,
        ministry_role_id: roleId,
      });
      toast({ title: "Added to ministry" });
      setMinistryId("");
      setRoleId("");
      setAddingService(false);
    } catch (e) {
      fail(e);
    }
  };

  const addInterest = async () => {
    if (!organizationId || !interestMinistryId) return;
    try {
      await createInterest.mutateAsync({
        organization_id: organizationId,
        person_id: member.id,
        ministry_id: interestMinistryId,
      });
      toast({ title: "Interest recorded" });
      setInterestMinistryId("");
      setAddingInterest(false);
    } catch (e) {
      fail(e);
    }
  };

  const stopServing = async (assignmentId: string, name: string) => {
    try {
      await endAssignment.mutateAsync({ assignmentId, memberId: member.id });
      toast({
        title: `No longer serving in ${name}`,
        description: "The record is kept, so their service history survives.",
      });
    } catch (e) {
      fail(e);
    }
  };

  /** Ministry name by id, for the interest list which stores only the id. */
  const ministryName = (id: string) =>
    ministries.data?.find((m) => m.id === id)?.name ?? "Ministry";

  return (
    <>
      <Card>
        <CardHeader className="pb-3 flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <HandHeart className="h-4 w-4" />
              Ministry service
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              Ending a ministry keeps the record, so past service still shows.
            </CardDescription>
          </div>
          {canEdit && !addingService && (
            <Button variant="outline" size="sm" onClick={() => setAddingService(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {addingService && (
            <div className="rounded-md border p-3 space-y-2">
              <div className="grid gap-2 sm:grid-cols-2">
                <Select value={ministryId} onValueChange={setMinistryId}>
                  <SelectTrigger aria-label="Ministry">
                    <SelectValue placeholder="Which ministry?" />
                  </SelectTrigger>
                  <SelectContent>
                    {(ministries.data ?? [])
                      .filter((m) => !servingMinistryIds.has(m.id))
                      .map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Select value={roleId} onValueChange={setRoleId}>
                  <SelectTrigger aria-label="Role">
                    <SelectValue placeholder="As what?" />
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
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAddingService(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={addService}
                  disabled={!ministryId || !roleId || createAssignment.isPending}
                >
                  {createAssignment.isPending && (
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  )}
                  Add
                </Button>
              </div>
            </div>
          )}

          {servingQuery.isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : serving.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Not currently serving in any ministry.
            </p>
          ) : (
            <ul className="divide-y">
              {serving.map((a) => (
                <li key={a.id} className="flex items-center justify-between py-2 gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{a.ministry.name}</p>
                    {a.start_date && (
                      <p className="text-xs text-muted-foreground">
                        Recorded since {a.start_date}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge
                      variant={a.role?.is_leadership_role ? "default" : "secondary"}
                    >
                      {a.role?.display_name ?? "Member"}
                    </Badge>
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title={`Stop serving in ${a.ministry.name}`}
                        onClick={() => stopServing(a.id, a.ministry.name)}
                        disabled={endAssignment.isPending}
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

      <Card>
        <CardHeader className="pb-3 flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Wants to serve in</CardTitle>
            <CardDescription className="text-xs mt-1">
              Interests that have not yet become an assignment.
            </CardDescription>
          </div>
          {canEdit && !addingInterest && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddingInterest(true)}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {addingInterest && (
            <div className="rounded-md border p-3 space-y-2">
              <Select
                value={interestMinistryId}
                onValueChange={setInterestMinistryId}
              >
                <SelectTrigger aria-label="Ministry of interest">
                  <SelectValue placeholder="Which ministry?" />
                </SelectTrigger>
                <SelectContent>
                  {(ministries.data ?? [])
                    .filter((m) => !interestMinistryIds.has(m.id))
                    .map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAddingInterest(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={addInterest}
                  disabled={!interestMinistryId || createInterest.isPending}
                >
                  {createInterest.isPending && (
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  )}
                  Add
                </Button>
              </div>
            </div>
          )}

          {(member.service_interests?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No service interests recorded.
            </p>
          ) : (
            <ul className="divide-y">
              {member.service_interests!.map((i) => {
                const cfg = SERVICE_INTEREST_STATUS_CONFIG[i.status];
                return (
                  <li key={i.id} className="flex items-center justify-between py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {ministryName(i.ministry_id)}
                      </p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {i.interest_level} interest
                      </p>
                    </div>
                    <Badge
                      className={cfg ? `${cfg.bgColor} ${cfg.color}` : ""}
                      variant="outline"
                    >
                      {cfg?.label ?? i.status}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
