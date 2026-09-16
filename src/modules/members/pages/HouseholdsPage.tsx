/**
 * Families — the repair screen for everything registration got once.
 *
 * Registration captures a whole family in one pass and then never lets anyone
 * touch it again. A family who register and later have a baby, or whose second
 * child was missed on the day, could only be fixed with SQL. The household
 * service and eleven hooks for this have existed since Phase 1 with no screen
 * behind them.
 *
 * Adding a child here is deliberately NOT householdService.addMember(), which
 * attaches an existing person. A child added that way would have no parent
 * relationship and no pickup authorisation, so the check-in desk would offer
 * nobody to collect them and their own mother would be refused.
 */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/shared/components/layout/DashboardLayout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Badge } from "@/shared/components/ui/badge";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Home,
  Search,
  Loader2,
  Baby,
  Plus,
  Star,
  Phone,
  UserRound,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/shared/contexts/AuthContext";
import { useOrganization } from "@/shared/contexts/OrganizationContext";
import { useCapabilities } from "@/shared/hooks/useCapabilities";
import { householdService } from "../services/householdService";
import { useHouseholdWithMembers, useSetPrimaryContact } from "../hooks/useHouseholds";
import { useSchoolGrades } from "../hooks/useReference";
import { MONTH_NAMES, type HouseholdSummary } from "../types";

const NONE = "__none__";

const householdKeys = {
  summaries: (orgId: string) => ["church", "households", "summaries", orgId] as const,
};

export default function HouseholdsPage() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { currentOrganization } = useOrganization();
  const { can } = useCapabilities();
  const orgId = currentOrganization?.id;
  const canWrite = isAdmin || can("members.write");

  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const {
    data: families,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: householdKeys.summaries(orgId ?? ""),
    queryFn: () => householdService.summaries(orgId!),
    enabled: !!orgId,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return families ?? [];
    return (families ?? []).filter((f) =>
      `${f.name} ${f.primary_contact_name ?? ""} ${f.primary_phone ?? ""}`
        .toLowerCase()
        .includes(q)
    );
  }, [families, search]);

  const childless = (families ?? []).filter((f) => f.child_count === 0).length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Home className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Families</h1>
            <p className="text-sm text-muted-foreground">
              {currentOrganization?.name ?? "Households and who is in them"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-56">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search by family, contact or phone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {canWrite && (
            <Button onClick={() => navigate("/members/new")}>
              <Plus className="h-4 w-4" />
              Register a family
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          /* "We could not ask" is not "there is nothing". This branch used to
             be missing, so a failed household_summaries call — most often
             not_permitted, because the RPC's permission list had drifted from
             the table's — rendered as the cheerful "No families yet" card
             while the Members page was reporting 516 households. */
          <FamiliesError error={error} onRetry={() => void refetch()} />
        ) : (families ?? []).length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center space-y-2">
              <Home className="h-10 w-10 mx-auto text-muted-foreground" />
              <p className="font-medium">No families yet</p>
              <p className="text-sm text-muted-foreground">
                Registering a family creates one. Importing a spreadsheet with a
                family column creates them too.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {childless > 0 && (
              <p className="text-sm text-muted-foreground">
                {childless} famil{childless === 1 ? "y has" : "ies have"} no
                children recorded. A child has to be on file before they can be
                checked in.
              </p>
            )}
            <div className="grid gap-2">
              {filtered.map((family) => (
                <FamilyRow
                  key={family.household_id}
                  family={family}
                  onOpen={() => setOpenId(family.household_id)}
                />
              ))}
              {filtered.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nothing matches that.
                </p>
              )}
            </div>
          </>
        )}
      </div>

      <HouseholdSheet
        householdId={openId}
        organizationId={orgId}
        canWrite={canWrite}
        onClose={() => setOpenId(null)}
      />
    </DashboardLayout>
  );
}

/**
 * A failed load, said out loud.
 *
 * Deliberately shows the raw message. The one that actually turns up here is
 * `not_permitted` from church.household_summaries, and a reader who can see
 * that word can be told which grant they are missing; "something went wrong"
 * would have hidden a permission drift for as long as nobody thought to look
 * in the network tab.
 */
function FamiliesError({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  const message = error instanceof Error ? error.message : "Unknown error";
  const denied = /not_permitted|permission denied|42501/i.test(message);

  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardContent className="py-10 text-center space-y-3">
        <AlertTriangle className="h-9 w-9 mx-auto text-destructive" />
        <p className="font-medium">Could not load families</p>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          {denied
            ? "Your account can read the member directory but is not permitted to list households. Ask an administrator for the Members viewer grant."
            : "The household list did not come back. This is a failure to load, not an empty church."}
        </p>
        <p className="text-xs text-muted-foreground/80 font-mono break-all max-w-md mx-auto">
          {message}
        </p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </CardContent>
    </Card>
  );
}

function FamilyRow({
  family,
  onOpen,
}: {
  family: HouseholdSummary;
  onOpen: () => void;
}) {
  return (
    <button
      className="flex w-full items-center gap-3 rounded-md border p-3 text-left hover:bg-muted/50"
      onClick={onOpen}
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium truncate">{family.name}</p>
        <p className="text-xs text-muted-foreground truncate">
          {family.primary_contact_name ?? "No contact on file"}
          {family.primary_phone && (
            <>
              {" · "}
              <Phone className="inline h-3 w-3" /> {family.primary_phone}
            </>
          )}
          {family.city && ` · ${family.city}`}
        </p>
      </div>
      <div className="flex gap-1.5 shrink-0">
        <Badge variant="secondary" className="font-normal">
          {family.adult_count} adult{family.adult_count === 1 ? "" : "s"}
        </Badge>
        <Badge
          variant={family.child_count > 0 ? "default" : "outline"}
          className="font-normal"
        >
          {family.child_count} child{family.child_count === 1 ? "" : "ren"}
        </Badge>
      </div>
    </button>
  );
}

function HouseholdSheet({
  householdId,
  organizationId,
  canWrite,
  onClose,
}: {
  householdId: string | null;
  organizationId: string | undefined;
  canWrite: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading } = useHouseholdWithMembers(householdId ?? undefined);
  const setPrimary = useSetPrimaryContact();
  const [addingChild, setAddingChild] = useState(false);

  const refresh = () => {
    if (organizationId) {
      queryClient.invalidateQueries({
        queryKey: householdKeys.summaries(organizationId),
      });
    }
    queryClient.invalidateQueries({ queryKey: ["church", "households"] });
  };

  const members = data?.members ?? [];
  const adults = members.filter((m) => !m.is_child);
  const children = members.filter((m) => m.is_child);

  return (
    <>
      <Sheet open={!!householdId} onOpenChange={(o) => !o && onClose()}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{data?.name ?? "Family"}</SheetTitle>
            <SheetDescription>
              {[data?.address_line1, data?.city, data?.state]
                .filter(Boolean)
                .join(", ") || "No address on file"}
            </SheetDescription>
          </SheetHeader>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="mt-4 space-y-5">
              <section className="space-y-2">
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  Adults ({adults.length})
                </p>
                {adults.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No adults in this family. Nobody can be authorised to
                    collect a child here.
                  </p>
                )}
                {adults.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-2 rounded-md border p-2.5"
                  >
                    <UserRound className="h-4 w-4 text-muted-foreground shrink-0" />
                    <button
                      className="min-w-0 flex-1 text-left"
                      onClick={() => navigate(`/members/${m.id}`)}
                    >
                      <p className="text-sm font-medium truncate">
                        {m.first_name} {m.last_name}
                      </p>
                      {m.phone && (
                        <p className="text-xs text-muted-foreground truncate">
                          {m.phone}
                        </p>
                      )}
                    </button>
                    {m.is_primary_contact ? (
                      <Badge className="gap-1 shrink-0">
                        <Star className="h-3 w-3" />
                        Main contact
                      </Badge>
                    ) : (
                      canWrite && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="shrink-0"
                          onClick={async () => {
                            if (!householdId) return;
                            try {
                              await setPrimary.mutateAsync({
                                householdId,
                                personId: m.id,
                              });
                              toast.success("Main contact updated");
                              refresh();
                            } catch (err) {
                              toast.error(
                                err instanceof Error ? err.message : String(err)
                              );
                            }
                          }}
                        >
                          Make main
                        </Button>
                      )
                    )}
                  </div>
                ))}
              </section>

              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium uppercase text-muted-foreground">
                    Children ({children.length})
                  </p>
                  {canWrite && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAddingChild(true)}
                    >
                      <Plus className="h-4 w-4" />
                      Add a child
                    </Button>
                  )}
                </div>
                {children.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No children on file. A child has to be here before they can
                    be checked in to Kids Ministry.
                  </p>
                )}
                {children.map((m) => (
                  <button
                    key={m.id}
                    className="flex w-full items-center gap-2 rounded-md border p-2.5 text-left hover:bg-muted/50"
                    onClick={() => navigate(`/members/${m.id}`)}
                  >
                    <Baby className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {m.first_name} {m.last_name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {m.birth_year
                          ? `Born ${m.birth_year}`
                          : "No birth year — cannot be placed in a classroom"}
                      </p>
                    </div>
                  </button>
                ))}
              </section>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AddChildDialog
        open={addingChild}
        householdId={householdId}
        organizationId={organizationId}
        onClose={() => setAddingChild(false)}
        onAdded={refresh}
      />
    </>
  );
}

function AddChildDialog({
  open,
  householdId,
  organizationId,
  onClose,
  onAdded,
}: {
  open: boolean;
  householdId: string | null;
  organizationId: string | undefined;
  onClose: () => void;
  onAdded: () => void;
}) {
  const { data: grades } = useSchoolGrades(organizationId);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    birth_year: "",
    birth_month: NONE,
    school_grade_id: NONE,
    hasMedical: false,
    allergy_severity: NONE,
    allergies: "",
    medications: "",
  });

  const reset = () =>
    setForm({
      first_name: "",
      last_name: "",
      birth_year: "",
      birth_month: NONE,
      school_grade_id: NONE,
      hasMedical: false,
      allergy_severity: NONE,
      allergies: "",
      medications: "",
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a child</DialogTitle>
          <DialogDescription>
            They get their own member record, and every adult in this family is
            automatically made a parent and authorised to collect them.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>
                First name <span className="text-destructive">*</span>
              </Label>
              <Input
                value={form.first_name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, first_name: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Last name</Label>
              <Input
                value={form.last_name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, last_name: e.target.value }))
                }
                placeholder="Family surname"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>
                Birth year <span className="text-destructive">*</span>
              </Label>
              <Input
                value={form.birth_year}
                onChange={(e) =>
                  setForm((f) => ({ ...f, birth_year: e.target.value }))
                }
                placeholder="2019"
              />
            </div>
            <div className="space-y-2">
              <Label>Birth month</Label>
              <Select
                value={form.birth_month}
                onValueChange={(v) => setForm((f) => ({ ...f, birth_month: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Not given" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not given</SelectItem>
                  {MONTH_NAMES.map((m, i) => (
                    <SelectItem key={m} value={String(i + 1)}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>School grade</Label>
              <Select
                value={form.school_grade_id}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, school_grade_id: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Not given" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not given</SelectItem>
                  {(grades ?? []).map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            The grade decides their classroom. Birth year is used when no grade
            is on file.
          </p>

          <label className="flex items-center gap-2 text-sm pt-1">
            <Checkbox
              checked={form.hasMedical}
              onCheckedChange={(v) =>
                setForm((f) => ({
                  ...f,
                  hasMedical: !!v,
                  // Cleared on the way out, so a value typed and then unticked
                  // is not submitted anyway.
                  ...(v
                    ? {}
                    : { allergy_severity: NONE, allergies: "", medications: "" }),
                }))
              }
            />
            This child has allergies or medical needs
          </label>

          {form.hasMedical && (
            <div className="rounded-md border bg-muted/30 p-3 space-y-3">
              <div className="space-y-2">
                <Label>Severity</Label>
                <Select
                  value={form.allergy_severity}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, allergy_severity: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Not asked" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Not asked</SelectItem>
                    <SelectItem value="none">No allergy</SelectItem>
                    <SelectItem value="mild">Mild</SelectItem>
                    <SelectItem value="severe">Severe</SelectItem>
                    <SelectItem value="life_threatening">
                      Life-threatening
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Allergic to</Label>
                <Input
                  value={form.allergies}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, allergies: e.target.value }))
                  }
                  placeholder="Peanuts, dairy"
                />
              </div>
              <div className="space-y-2">
                <Label>Medication</Label>
                <Input
                  value={form.medications}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, medications: e.target.value }))
                  }
                  placeholder="EpiPen in their bag"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                An allergy prints on their name tag and shows on the safety card
                volunteers open in an emergency.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button
            disabled={saving || !form.first_name.trim() || !form.birth_year.trim()}
            onClick={async () => {
              if (!householdId) return;
              setSaving(true);
              try {
                await householdService.addChild(householdId, {
                  first_name: form.first_name.trim(),
                  last_name: form.last_name.trim() || undefined,
                  birth_year: form.birth_year.trim(),
                  birth_month:
                    form.birth_month === NONE ? undefined : form.birth_month,
                  school_grade_id:
                    form.school_grade_id === NONE
                      ? undefined
                      : form.school_grade_id,
                  ...(form.hasMedical
                    ? {
                        allergy_severity:
                          form.allergy_severity === NONE
                            ? undefined
                            : form.allergy_severity,
                        allergies: form.allergies.trim() || undefined,
                        medications: form.medications.trim() || undefined,
                      }
                    : {}),
                });
                toast.success(`${form.first_name} added to the family`);
                reset();
                onClose();
                onAdded();
              } catch (err) {
                const raw = err instanceof Error ? err.message : String(err);
                toast.error("Could not add the child", {
                  description: raw.includes("child_requires_birth_year")
                    ? "A birth year is needed — it decides their classroom."
                    : raw,
                });
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Add child
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
