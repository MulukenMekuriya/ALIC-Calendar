/**
 * Who can do what in the Members and Kids modules.
 *
 * church.module_grants has existed since the permission model was built and
 * nothing has ever written a row — so in production every capability resolved
 * from "is this person an organization admin", and the four roles the model
 * exists to serve were unreachable. At Silver Spring that meant six people
 * could staff a check-in desk out of thirty-seven.
 *
 * Permissions are ADDITIVE and separate from the app_role in
 * public.user_organizations, which allows only one role per person per branch.
 * That is the whole reason this table exists: granting someone kids_volunteer
 * must not cost them their treasury or contributor role.
 *
 * Granting is an organization-admin act. A members_admin cannot reach this
 * screen, because otherwise they could promote themselves to kids_admin and
 * read children's medical data.
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
import { Input } from "@/shared/components/ui/input";
import { Badge } from "@/shared/components/ui/badge";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Info, Loader2, Search, ShieldCheck, UserCog } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { grantService, type OrgPerson } from "../services/grantService";
import type { MinistryRole } from "@/shared/lib/capabilities";

/**
 * Ordered so the two most commonly granted sit at the top.
 *
 * Every value of church.module_permission must appear here. A permission the
 * database knows and this list does not is unreachable: the tickbox grid is
 * built from this array, so an admin can neither grant nor revoke it. That is
 * what happened to kids_leader between 20260321001000, which created it, and
 * this list gaining it \u2014 the four team leads only held it because
 * 20260321001300 wrote the rows directly, and a fifth could not have been
 * appointed without hand-editing the database.
 */
export const PERMISSIONS: {
  value: MinistryRole;
  label: string;
  description: string;
}[] = [
  {
    value: "kids_volunteer",
    label: "Kids volunteer",
    description:
      "Run the check-in desk: look up families, check children in and out, message parents. Cannot browse the directory or the Kids reports.",
  },
  {
    value: "members_viewer",
    label: "Members viewer",
    description: "See the church directory. Cannot change anything.",
  },
  {
    value: "kids_admin",
    label: "Kids Ministry leader",
    description:
      "Everything a volunteer can do, plus classrooms, teachers, reports, and authorising a pickup override. Includes children's medical information — every access is logged.",
  },
  {
    value: "kids_leader",
    label: "Kids team lead",
    description:
      "Runs their own grades: the desk, the roster and the reports for the classrooms assigned to them. Cannot authorise a pickup override or set a pickup restriction \u2014 those escalate to a Ministry leader, which is what keeps the two-person rule real.",
  },
  {
    value: "members_admin",
    label: "Members admin",
    description: "Add and edit members, households and relationships.",
  },
  {
    value: "members_import",
    label: "Members import",
    description: "Import members from a spreadsheet.",
  },
  {
    value: "leadership_viewer",
    label: "Leadership viewer",
    description: "Read-only across Members and Kids, for reports and oversight.",
  },
  {
    value: "giving_admin",
    label: "Giving admin",
    description:
      "Record gifts, run imports, post counting batches and issue year-end statements, and see any donor's history. Does NOT include the directory \u2014 the giving screens show a donor's name without it. Every statement run is logged.",
  },
  {
    value: "giving_viewer",
    label: "Giving viewer",
    description:
      "Read the ledger and the fund totals without being able to change anything or issue statements. For a pastor or a board member who needs the numbers.",
  },
];

export const grantKeys = {
  all: ["church", "grants"] as const,
  forOrg: (orgId: string) => [...grantKeys.all, orgId] as const,
};

interface ModuleGrantsPanelProps {
  organizationId: string | undefined;
  /** Only an organization admin may grant. */
  canGrant: boolean;
}

export function ModuleGrantsPanel({
  organizationId,
  canGrant,
}: ModuleGrantsPanelProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<OrgPerson | null>(null);
  const [draft, setDraft] = useState<Set<MinistryRole>>(new Set());

  const { data: people, isLoading } = useQuery({
    queryKey: grantKeys.forOrg(organizationId ?? ""),
    queryFn: () => grantService.listOrgPeople(organizationId!),
    enabled: !!organizationId && open && canGrant,
  });

  const save = useMutation({
    mutationFn: (params: { userId: string; permissions: MinistryRole[] }) =>
      grantService.setGrants(organizationId!, params.userId, params.permissions),
    onSuccess: () => {
      if (organizationId) {
        queryClient.invalidateQueries({ queryKey: grantKeys.forOrg(organizationId) });
      }
      // The person's own session caches their capabilities, so they see the
      // change on their next load rather than instantly. Say so.
      queryClient.invalidateQueries({ queryKey: ["church", "module-grants"] });
    },
  });

  if (!canGrant) return null;

  const filtered = (people ?? []).filter((p) =>
    !search.trim()
      ? true
      : `${p.full_name} ${p.email ?? ""}`
          .toLowerCase()
          .includes(search.trim().toLowerCase())
  );
  const withAny = (people ?? []).filter(
    (p) => p.permissions.length > 0 || p.is_org_admin
  ).length;

  return (
    <>
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0 gap-4">
          <div>
            <CardTitle className="text-base">Who can use these modules</CardTitle>
            <CardDescription>
              Give someone access to the check-in desk, the directory or the
              Kids Ministry screens without changing their main role.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => setOpen(true)}
          >
            <UserCog className="h-4 w-4" />
            Manage access
          </Button>
        </CardHeader>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Module access</DialogTitle>
            <DialogDescription>
              Organization admins already have full access to everything. Anyone
              else needs a permission here.
            </DialogDescription>
          </DialogHeader>

          {!isLoading && withAny === (people ?? []).length && withAny > 0 && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Everyone in this branch already has access.
              </AlertDescription>
            </Alert>
          )}

          {!isLoading && (people ?? []).length > 0 && withAny <= 1 && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Nobody here has module access yet, so only organization admins
                can open the check-in station or the directory. Give your desk
                volunteers <strong>Kids volunteer</strong> to change that.
              </AlertDescription>
            </Alert>
          )}

          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search by name or email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="max-h-96 space-y-1.5 overflow-y-auto">
            {isLoading && (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {filtered.map((person) => (
              <button
                key={person.user_id}
                className="flex w-full items-center gap-3 rounded-md border p-2.5 text-left hover:bg-muted/50"
                onClick={() => {
                  setEditing(person);
                  setDraft(new Set(person.permissions));
                }}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    {person.full_name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {person.email ?? "no email"}
                    {!person.person_id && " · no member record yet"}
                  </p>
                </div>
                <div className="flex flex-wrap justify-end gap-1 shrink-0 max-w-[55%]">
                  {person.is_org_admin && (
                    <Badge className="gap-1">
                      <ShieldCheck className="h-3 w-3" />
                      Admin — full access
                    </Badge>
                  )}
                  {person.permissions.map((p) => (
                    <Badge key={p} variant="secondary" className="font-normal">
                      {PERMISSIONS.find((x) => x.value === p)?.label ?? p}
                    </Badge>
                  ))}
                  {!person.is_org_admin && person.permissions.length === 0 && (
                    <span className="text-xs text-muted-foreground">
                      No access
                    </span>
                  )}
                </div>
              </button>
            ))}
            {!isLoading && filtered.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {search ? "Nobody matches that." : "Nobody is in this branch yet."}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.full_name}</DialogTitle>
            <DialogDescription>
              {editing?.is_org_admin
                ? "This person is an organization admin, so they already have every permission. Anything ticked here is recorded but changes nothing for them."
                : "Tick what they should be able to do. This does not change their main role."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
            {PERMISSIONS.map((permission) => (
              <label
                key={permission.value}
                className="flex cursor-pointer items-start gap-3 rounded-md border p-3"
              >
                <Checkbox
                  className="mt-0.5"
                  checked={draft.has(permission.value)}
                  onCheckedChange={(checked) => {
                    const next = new Set(draft);
                    if (checked) next.add(permission.value);
                    else next.delete(permission.value);
                    setDraft(next);
                  }}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    {permission.label}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {permission.description}
                  </span>
                </span>
              </label>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              disabled={save.isPending}
              onClick={async () => {
                if (!editing) return;
                try {
                  await save.mutateAsync({
                    userId: editing.user_id,
                    permissions: [...draft],
                  });
                  toast.success(`Access updated for ${editing.full_name}`, {
                    description:
                      "They will see the change the next time they open the app.",
                  });
                  setEditing(null);
                } catch (err) {
                  toast.error("Could not update access", {
                    description:
                      err instanceof Error ? err.message : String(err),
                  });
                }
              }}
            >
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
