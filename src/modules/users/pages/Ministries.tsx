import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/shared/components/layout/DashboardLayout";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { useToast } from "@/shared/hooks/use-toast";
import { Church, Plus, Pencil, EyeOff, Eye } from "lucide-react";
import { useOrganization } from "@/shared/contexts/OrganizationContext";
import { errorMessage } from "@/shared/lib/errorMessage";

/**
 * Ministries - OLD: the branch's budget.ministries, edited by its admin.
 *
 * This list is what the Ministry dropdown on Users & Roles offers, what the
 * finance forms match a login against, and what budgets hang off. So:
 *
 *   - Nothing is deleted. Budgets, requests and allocations point at the id,
 *     so a ministry that is no longer used is hidden (is_active = false) and
 *     can be restored.
 *   - A rename carries its people with it. The finance forms find a login's
 *     ministry by profiles.ministry_name == ministries.name, so renaming the
 *     ministry alone would leave every login on it looking for a name that no
 *     longer exists.
 */

interface MinistryRow {
  id: string;
  name: string;
  is_active: boolean;
  leader_id: string | null;
}

/** Same name, ignoring case and stray spaces: what the unique key and the forms care about. */
const sameName = (a: string, b: string) =>
  a.trim().replace(/\s+/g, " ").toLowerCase() === b.trim().replace(/\s+/g, " ").toLowerCase();

const tidy = (name: string) => name.trim().replace(/\s+/g, " ");

const Ministries = () => {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const [search, setSearch] = useState("");
  // null = closed; id null = adding a new one.
  const [editing, setEditing] = useState<{ id: string | null; name: string; was: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: ministries = [], refetch, error: loadError } = useQuery({
    queryKey: ["branch-ministries-admin", currentOrganization?.id],
    queryFn: async (): Promise<MinistryRow[]> => {
      const { data, error } = await supabase
        .schema("budget")
        .from("ministries")
        .select("id, name, is_active, leader_id")
        .eq("organization_id", currentOrganization!.id)
        .order("name");

      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
  });

  const leaderIds = useMemo(
    () => [...new Set(ministries.map((m) => m.leader_id).filter((id): id is string => !!id))],
    [ministries],
  );

  const { data: leaders = {} } = useQuery({
    queryKey: ["ministry-leaders", leaderIds],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, email").in("id", leaderIds);
      return Object.fromEntries((data || []).map((p) => [p.id, p.email as string]));
    },
    enabled: leaderIds.length > 0,
  });

  const { active, hidden } = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matching = ministries.filter((m) => !query || m.name.toLowerCase().includes(query));
    return {
      active: matching.filter((m) => m.is_active),
      hidden: matching.filter((m) => !m.is_active),
    };
  }, [ministries, search]);

  /** Refused here so the admin reads a sentence, not a unique-key violation. */
  const clashesWith = (name: string, id: string | null) =>
    ministries.find((m) => m.id !== id && sameName(m.name, name));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || !currentOrganization?.id) return;

    const name = tidy(editing.name);
    if (!name) return;

    const clash = clashesWith(name, editing.id);
    if (clash) {
      toast({
        title: "That name is taken",
        description: clash.is_active
          ? `${clash.name} is already a ministry in ${currentOrganization.name}.`
          : `${clash.name} is hidden. Restore it instead of adding it again.`,
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      if (editing.id === null) {
        const { error } = await supabase
          .schema("budget")
          .from("ministries")
          .insert({ organization_id: currentOrganization.id, name, is_active: true });
        if (error) throw error;

        toast({ title: "Ministry added", description: `${name} is now on the list.` });
      } else {
        // .select() so a write the policies refused cannot read as a success.
        const { data, error } = await supabase
          .schema("budget")
          .from("ministries")
          .update({ name, updated_at: new Date().toISOString() })
          .eq("id", editing.id)
          .select("id");
        if (error) throw error;
        if (!data || data.length === 0) {
          throw new Error("The ministry was not renamed. You may not have permission in this branch.");
        }

        // Carry its people across. Row-level security limits this to profiles
        // in branches this admin runs.
        const { data: moved, error: moveError } = await supabase
          .from("profiles")
          .update({ ministry_name: name })
          .eq("ministry_name", editing.was)
          .select("id");
        if (moveError) throw moveError;

        const n = moved?.length ?? 0;
        toast({
          title: "Ministry renamed",
          description: `${editing.was} is now ${name}.${
            n > 0 ? ` ${n} ${n === 1 ? "login was" : "logins were"} moved with it.` : ""
          }`,
        });
      }

      setEditing(null);
      refetch();
    } catch (error) {
      toast({ title: "Error", description: errorMessage(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (ministry: MinistryRow, isActive: boolean) => {
    try {
      const { data, error } = await supabase
        .schema("budget")
        .from("ministries")
        .update({ is_active: isActive, updated_at: new Date().toISOString() })
        .eq("id", ministry.id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Nothing changed. You may not have permission in this branch.");
      }

      toast({
        title: isActive ? "Ministry restored" : "Ministry hidden",
        description: isActive
          ? `${ministry.name} is back on the list.`
          : `${ministry.name} is off the list. Its budgets and requests are kept, and it can be restored.`,
      });
      refetch();
    } catch (error) {
      toast({ title: "Error", description: errorMessage(error), variant: "destructive" });
    }
  };

  const rows = (list: MinistryRow[]) =>
    list.map((m) => (
      <TableRow key={m.id} className={m.is_active ? undefined : "text-muted-foreground"}>
        <TableCell className="font-medium">{m.name}</TableCell>
        <TableCell className="hidden sm:table-cell">
          {(m.leader_id && leaders[m.leader_id]) || "-"}
        </TableCell>
        <TableCell>
          <Badge variant={m.is_active ? "secondary" : "outline"}>
            {m.is_active ? "Active" : "Hidden"}
          </Badge>
        </TableCell>
        <TableCell>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              aria-label={`Rename ${m.name}`}
              onClick={() => setEditing({ id: m.id, name: m.name, was: m.name })}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              aria-label={m.is_active ? `Hide ${m.name}` : `Restore ${m.name}`}
              onClick={() => setActive(m, !m.is_active)}
            >
              {m.is_active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </TableCell>
      </TableRow>
    ));

  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Ministries</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            The ministries of {currentOrganization?.name ?? "this branch"}. This is the list the
            Ministry dropdown on Users &amp; Roles and the finance forms use.
          </p>
        </div>

        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 sm:p-6">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Church className="h-4 w-4 sm:h-5 sm:w-5" />
              Ministries ({active.length} active
              {hidden.length > 0 && ` · ${hidden.length} hidden`})
            </CardTitle>
            <Button
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => setEditing({ id: null, name: "", was: "" })}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Ministry
            </Button>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            <Input
              placeholder="Search ministries"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="sm:max-w-xs mb-4"
            />
            {loadError && (
              <div className="text-sm text-destructive mb-4">
                Error loading ministries: {errorMessage(loadError, "Unknown error")}
              </div>
            )}
            {active.length + hidden.length === 0 ? (
              <div className="text-center py-6 sm:py-8 text-sm sm:text-base text-muted-foreground">
                {search.trim() ? "No ministry matches that search." : "No ministries yet."}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="hidden sm:table-cell">Leader</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows(active)}
                  {rows(hidden)}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing?.id ? "Rename Ministry" : "Add Ministry"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ministry_name_field">Name *</Label>
                <Input
                  id="ministry_name_field"
                  value={editing?.name ?? ""}
                  onChange={(e) => setEditing(editing ? { ...editing, name: e.target.value } : null)}
                  placeholder="e.g. Choir VA"
                  required
                />
                {editing?.id && (
                  <p className="text-xs text-muted-foreground">
                    Logins on {editing.was} move to the new name, and its budgets and requests stay
                    with it.
                  </p>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={saving || !tidy(editing?.name ?? "")}>
                {editing?.id ? "Save" : "Add Ministry"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Ministries;
