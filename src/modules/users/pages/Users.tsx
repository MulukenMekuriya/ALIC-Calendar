import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/shared/components/layout/DashboardLayout";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { useToast } from "@/shared/hooks/use-toast";
import { UserPlus, Shield, UserCog, Pencil, Trash2 } from "lucide-react";
import { useOrganization } from "@/shared/contexts/OrganizationContext";
import { errorMessage } from "@/shared/lib/errorMessage";
import { useAuth } from "@/shared/contexts/AuthContext";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { EVERYONE, STAFF_ONLY, filterRoster } from "../utils/roster";

/**
 * Every public.app_role tier, most privileged first.
 *
 * This screen used to offer two of them, which is why branch roles were being
 * set by hand in the Supabase table editor: treasury and finance existed in the
 * enum with nowhere in the app to choose them, and 'member' did not exist yet.
 *
 * app_role is EXCLUSIVE — public.user_organizations has
 * UNIQUE(user_id, organization_id) — so picking one here replaces whatever the
 * person held in this branch. Anything additive (kids volunteer, members admin)
 * is a module grant instead, set from Members -> Manage access, and is not
 * affected by anything on this screen.
 */
const APP_ROLES = [
  {
    value: "admin",
    label: "Admin",
    description: "Everything in this branch, including children's medical data.",
  },
  {
    value: "board",
    label: "Board",
    description:
      "Reads the year's budget requests together and says what the Board thinks. Does not approve.",
  },
  {
    value: "treasury",
    label: "Treasury",
    description: "Approves expenses at the treasury stage.",
  },
  {
    value: "finance",
    label: "Finance",
    description: "Approves expenses at the finance stage.",
  },
  {
    value: "contributor",
    label: "Contributor",
    description: "Staff baseline: raise requests, see the calendar and the budget.",
  },
  {
    value: "member",
    label: "Member",
    description:
      "A login and nothing else. Sees only their own record \u2014 no calendar, no budget, no inventory, no directory.",
  },
] as const;

const roleLabel = (role?: string | null) =>
  APP_ROLES.find((r) => r.value === role)?.label ?? "Member";

const RoleBadge = ({
  role,
  className,
}: {
  role?: string | null;
  className?: string;
}) => (
  <Badge variant={role === "admin" ? "default" : "secondary"} className={className}>
    {role === "admin" && <Shield className="h-3 w-3 mr-1" />}
    {roleLabel(role)}
  </Badge>
);

const Users = () => {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const { user: actingUser } = useAuth();
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [isEditUserOpen, setIsEditUserOpen] = useState(false);
  const [newUser, setNewUser] = useState({ email: "", password: "", full_name: "", ministry_name: "", role: "member" });
  // 589 of the 625 people in MD hold 'member' — the whole Breeze import. This
  // screen is for giving somebody a job, so it opens on the people who have
  // one, and the rest are a filter away rather than 589 rows away.
  const [roleFilter, setRoleFilter] = useState<string>(STAFF_ONLY);
  const [search, setSearch] = useState("");
  // The Board reads MD and VA as one budget, so the tier is meant to be held
  // in both branches. Held in one, a board member is shown half the year with
  // nothing to say that half is missing.
  const [applyToBothBranches, setApplyToBothBranches] = useState(true);

  /**
   * The branches this admin may write a membership into.
   *
   * Not "all branches": the policies added in 20260322330000 allow an admin to
   * write memberships in the branches they administer and nowhere else, so
   * offering more than this would produce a silent half-failure.
   */
  const { data: myAdminOrganizations } = useQuery({
    queryKey: ["my-admin-organizations", actingUser?.id],
    queryFn: async () => {
      if (!actingUser?.id) return [];

      const { data, error } = await supabase
        .from("user_organizations")
        .select("organization_id, organizations:organization_id (id, name)")
        .eq("user_id", actingUser.id)
        .eq("role", "admin");

      if (error) throw error;

      return (data || []).map((row) => ({
        id: row.organization_id,
        name:
          (row.organizations as { name?: string } | null)?.name ?? "Another branch",
      }));
    },
    enabled: !!actingUser?.id,
  });

  const otherBranches = (myAdminOrganizations || []).filter(
    (org) => org.id !== currentOrganization?.id,
  );

  /**
   * Give somebody the same tier in the other branches this admin runs.
   *
   * Returns the branch names it managed, so the caller can say what happened
   * rather than implying more than was done.
   */
  const spreadsAcrossBranches = (role: string) =>
    role === "board" && applyToBothBranches && otherBranches.length > 0;

  const grantInOtherBranches = async (
    userId: string,
    email: string,
    role: string,
  ) => {
    if (!spreadsAcrossBranches(role)) return [];

    const { data, error } = await supabase
      .from("user_organizations")
      .upsert(
        otherBranches.map((org) => ({
          user_id: userId,
          organization_id: org.id,
          role: role as (typeof APP_ROLES)[number]["value"],
          is_primary: false,
          // NOT NULL, and the trigger that fills it only fires when the column
          // is absent from the statement. Sending what we already know is
          // cheaper than relying on that.
          email,
        })),
        { onConflict: "user_id,organization_id" },
      )
      .select("organization_id");

    if (error) throw error;

    return otherBranches
      .filter((org) => (data || []).some((row) => row.organization_id === org.id))
      .map((org) => org.name);
  };
  const [editingUser, setEditingUser] = useState<{ id: string; email: string; full_name: string; phone_number?: string; ministry_name?: string; role: string } | null>(null);

  const { data: users, refetch: refetchUsers, error: usersError } = useQuery({
    queryKey: ["users-with-roles", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];

      // First, get user IDs in this organization
      const { data: orgUsers, error: orgUsersError } = await supabase
        .from("user_organizations")
        .select("user_id, role")
        .eq("organization_id", currentOrganization.id);

      if (orgUsersError) {
        console.error("Error fetching org users:", orgUsersError);
        throw orgUsersError;
      }

      if (!orgUsers || orgUsers.length === 0) return [];

      const userIds = orgUsers.map(u => u.user_id);

      // Get profiles for users in this organization
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .in("id", userIds);

      if (profilesError) {
        console.error("Error fetching profiles:", profilesError);
        throw profilesError;
      }

      // Manually join the data with org roles
      const usersWithRoles = profiles?.map(profile => {
        const userOrgInfo = orgUsers.find(u => u.user_id === profile.id);
        return {
          ...profile,
          user_roles: userOrgInfo ? [{ role: userOrgInfo.role }] : []
        };
      }) || [];

      console.log("Fetched users:", usersWithRoles);
      return usersWithRoles;
    },
    enabled: !!currentOrganization?.id,
  });


  const visibleUsers = useMemo(
    () => filterRoster(users, roleFilter, search),
    [users, roleFilter, search],
  );
  const hiddenCount = (users?.length || 0) - visibleUsers.length;

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!currentOrganization?.id) {
        throw new Error("No organization selected");
      }

      // Get current session token
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error("No active session");
      }

      // Call the edge function to create user with admin API
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          email: newUser.email,
          password: newUser.password,
          full_name: newUser.full_name,
          ministry_name: newUser.ministry_name,
          role: newUser.role,
          organization_id: currentOrganization.id,
        },
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      const alsoIn = data?.user?.id
        ? await grantInOtherBranches(data.user.id, newUser.email, newUser.role)
        : [];

      toast({
        title: "User created",
        description: `${newUser.full_name} is ${roleLabel(newUser.role)} in ${currentOrganization.name}${
          alsoIn.length > 0 ? ` and ${alsoIn.join(", ")}` : ""
        }.`,
      });
      setIsAddUserOpen(false);
      setNewUser({ email: "", password: "", full_name: "", ministry_name: "", role: "member" });
      refetchUsers();
    } catch (error) {
      toast({
        title: "Error",
        description: errorMessage(error),
        variant: "destructive",
      });
    }
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || !currentOrganization?.id) return;

    try {
      // Update profile
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          full_name: editingUser.full_name,
          phone_number: editingUser.phone_number,
          ministry_name: editingUser.ministry_name,
        })
        .eq("id", editingUser.id);

      if (profileError) throw profileError;

      // Update role in user_organizations table.
      //
      // .select() is the point of this call, not decoration. Row-level
      // security refuses by matching no rows rather than by erroring, and
      // until 20260322330000 there was no admin policy here at all: every
      // role change ran, changed nothing, and was reported as a success.
      const { data: roleRows, error: roleError } = await supabase
        .from("user_organizations")
        .update({ role: editingUser.role as (typeof APP_ROLES)[number]["value"] })
        .eq("user_id", editingUser.id)
        .eq("organization_id", currentOrganization.id)
        .select("user_id");

      if (roleError) throw roleError;

      if (!roleRows || roleRows.length === 0) {
        throw new Error(
          "The role was not changed. You may not have permission to set roles in this branch.",
        );
      }

      const alsoIn = await grantInOtherBranches(
        editingUser.id,
        editingUser.email,
        editingUser.role,
      );

      toast({
        title: "User updated",
        description: `${editingUser.full_name} is now ${roleLabel(editingUser.role)} in ${
          currentOrganization.name
        }${alsoIn.length > 0 ? ` and ${alsoIn.join(", ")}` : ""}.`,
      });
      setIsEditUserOpen(false);
      setEditingUser(null);
      refetchUsers();
    } catch (error) {
      toast({
        title: "Error",
        description: errorMessage(error),
        variant: "destructive",
      });
    }
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (!confirm(`Are you sure you want to remove ${userName} from this organization? This action cannot be undone.`)) {
      return;
    }

    if (!currentOrganization?.id) return;

    try {
      // Remove user from this organization
      const { data, error: orgError, count } = await supabase
        .from("user_organizations")
        .delete()
        .eq("user_id", userId)
        .eq("organization_id", currentOrganization.id)
        .select();

      console.log("Delete result:", { data, orgError, count, userId, orgId: currentOrganization.id });

      if (orgError) throw orgError;

      if (!data || data.length === 0) {
        throw new Error("Failed to remove user. You may not have permission to perform this action.");
      }

      toast({ title: "User removed from organization successfully" });
      await refetchUsers();
    } catch (error) {
      console.error("Delete user error:", error);
      toast({
        title: "Error",
        description: errorMessage(error),
        variant: "destructive",
      });
    }
  };

  /**
   * Offered for the Board tier only, and only when there is another branch
   * this admin can write to. The Board reads both branches as one budget;
   * every other tier belongs to the branch it was set in.
   */
  const BothBranchesToggle = ({ role }: { role: string }) => {
    if (role !== "board" || otherBranches.length === 0) return null;

    return (
      <label className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 cursor-pointer">
        <Checkbox
          checked={applyToBothBranches}
          onCheckedChange={(checked) => setApplyToBothBranches(checked === true)}
          className="mt-0.5"
        />
        <span className="text-sm">
          Also in {otherBranches.map((org) => org.name).join(", ")}
          <span className="block text-xs text-muted-foreground">
            The Board reviews both branches as one budget. Without this they
            would see only {currentOrganization?.name}.
          </span>
        </span>
      </label>
    );
  };

  const openEditDialog = (user: {
    id: string;
    email: string;
    full_name: string;
    phone_number: string | null;
    ministry_name: string | null;
    user_roles?: Array<{ role: string }> | null;
  }) => {
    setEditingUser({
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      phone_number: user.phone_number || "",
      ministry_name: user.ministry_name || "",
      // The real tier, not "admin or else contributor". Collapsing it here meant
      // opening this dialog on a treasury user and pressing Update silently
      // demoted them to contributor.
      role: user.user_roles?.[0]?.role ?? "contributor",
    });
    setIsEditUserOpen(true);
  };


  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">User Management</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">Manage users and roles</p>
        </div>

        <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 sm:p-6">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <UserCog className="h-4 w-4 sm:h-5 sm:w-5" />
                Users ({visibleUsers.length}
                {hiddenCount > 0 && ` of ${users?.length || 0}`})
              </CardTitle>
              <Dialog open={isAddUserOpen} onOpenChange={setIsAddUserOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="w-full sm:w-auto">
                    <UserPlus className="h-4 w-4 mr-2" />
                    Add User
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add New User</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleAddUser} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="full_name">Full Name *</Label>
                      <Input
                        id="full_name"
                        value={newUser.full_name}
                        onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email *</Label>
                      <Input
                        id="email"
                        type="email"
                        value={newUser.email}
                        onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">Password *</Label>
                      <Input
                        id="password"
                        type="password"
                        value={newUser.password}
                        onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                        required
                        minLength={6}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ministry_name">Ministry Name</Label>
                      <Input
                        id="ministry_name"
                        value={newUser.ministry_name}
                        onChange={(e) => setNewUser({ ...newUser, ministry_name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="role">Role *</Label>
                      <Select
                        value={newUser.role}
                        onValueChange={(value) => setNewUser({ ...newUser, role: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {APP_ROLES.map((r) => (
                            <SelectItem key={r.value} value={r.value}>
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <BothBranchesToggle role={newUser.role} />
                    </div>
                    <Button type="submit" className="w-full">Create User</Button>
                  </form>
                </DialogContent>
              </Dialog>

              {/* Edit User Dialog */}
              <Dialog open={isEditUserOpen} onOpenChange={setIsEditUserOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Edit User</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleEditUser} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit_full_name">Full Name *</Label>
                      <Input
                        id="edit_full_name"
                        value={editingUser?.full_name || ""}
                        onChange={(e) => setEditingUser(editingUser ? { ...editingUser, full_name: e.target.value } : null)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit_email">Email (Read-only)</Label>
                      <Input
                        id="edit_email"
                        type="email"
                        value={editingUser?.email || ""}
                        disabled
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit_phone">Phone Number</Label>
                      <Input
                        id="edit_phone"
                        value={editingUser?.phone_number || ""}
                        onChange={(e) => setEditingUser(editingUser ? { ...editingUser, phone_number: e.target.value } : null)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit_ministry">Ministry Name</Label>
                      <Input
                        id="edit_ministry"
                        value={editingUser?.ministry_name || ""}
                        onChange={(e) => setEditingUser(editingUser ? { ...editingUser, ministry_name: e.target.value } : null)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit_role">Role *</Label>
                      <Select
                        value={editingUser?.role || "contributor"}
                        onValueChange={(value) => setEditingUser(editingUser ? { ...editingUser, role: value } : null)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {APP_ROLES.map((r) => (
                            <SelectItem key={r.value} value={r.value}>
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <BothBranchesToggle role={editingUser?.role || "contributor"} />
                    </div>
                    <Button type="submit" className="w-full">Update User</Button>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row gap-2 mb-4">
                <Input
                  placeholder="Search name, email or ministry"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="sm:max-w-xs"
                />
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="sm:w-[190px]" aria-label="Filter by role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={STAFF_ONLY}>Everyone but members</SelectItem>
                    <SelectItem value={EVERYONE}>Everyone</SelectItem>
                    {APP_ROLES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label} only
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {usersError && (
                <div className="text-sm text-destructive mb-4">
                  Error loading users: {errorMessage(usersError, "Unknown error")}
                </div>
              )}
              {visibleUsers.length === 0 ? (
                <div className="text-center py-6 sm:py-8 text-sm sm:text-base text-muted-foreground">
                  {usersError
                    ? "Failed to load users."
                    : hiddenCount > 0
                      ? `Nobody here matches. ${hiddenCount} ${hiddenCount === 1 ? "person is" : "people are"} filtered out \u2014 switch to Everyone to include members.`
                      : "No users found. Add users using the 'Add User' button above."}
                </div>
              ) : (
                <>
                  {/* Mobile Card View */}
                  <div className="md:hidden space-y-3">
                    {visibleUsers.map((user) => (
                      <div key={user.id} className="border rounded-lg p-3 space-y-3 bg-card">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{user.full_name}</p>
                            <p className="text-xs text-muted-foreground truncate mt-0.5">{user.email}</p>
                          </div>
                          <RoleBadge
                            role={user.user_roles?.[0]?.role}
                            className="text-xs shrink-0"
                          />
                        </div>
                        {(user.phone_number || user.ministry_name) && (
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            {user.phone_number && <span>{user.phone_number}</span>}
                            {user.ministry_name && <span>{user.ministry_name}</span>}
                          </div>
                        )}
                        <div className="flex gap-2 pt-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 h-8 text-xs"
                            onClick={() => openEditDialog(user)}
                          >
                            <Pencil className="h-3 w-3 mr-1.5" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 h-8 text-xs"
                            onClick={() => handleDeleteUser(user.id, user.full_name)}
                          >
                            <Trash2 className="h-3 w-3 mr-1.5 text-destructive" />
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop Table View */}
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Phone</TableHead>
                          <TableHead>Ministry</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visibleUsers.map((user) => (
                          <TableRow key={user.id}>
                            <TableCell className="font-medium">{user.full_name}</TableCell>
                            <TableCell>{user.email}</TableCell>
                            <TableCell>{user.phone_number || "-"}</TableCell>
                            <TableCell>{user.ministry_name || "-"}</TableCell>
                            <TableCell>
                              <RoleBadge role={user.user_roles?.[0]?.role} />
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openEditDialog(user)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleDeleteUser(user.id, user.full_name)}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
      </div>
    </DashboardLayout>
  );
};

export default Users;
