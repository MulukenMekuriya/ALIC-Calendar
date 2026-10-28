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
import { EVERYONE, filterRoster, holdsAJob, rankByRole } from "../utils/roster";

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
      "Gives final approval to budget requests the local leaders send on. Board is for every branch: setting it here sets it in all of them, and it cannot be combined with a branch role.",
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

/** Ids per profiles request; 200 keeps the URL near 8,000 characters. */
const PROFILE_BATCH = 200;

/** Radix Select will not take "" as a value, so "no ministry" needs a name. */
const NO_MINISTRY = "__none__";

/**
 * The branch's ministries, from budget.ministries, as the only choices.
 *
 * profiles.ministry_name was free text, which is how "BibleStudy VA",
 * "Bible Study<TAB>VA" and "Young Adults VA" got in: the finance forms match a
 * person to their ministry by exact name, so a typo there is a login that
 * cannot find its own budget. A name that is no longer on the list (an old
 * "ALIC VA ..." one) is still shown, marked, so opening Edit never changes it
 * silently; choosing anything else replaces it.
 */
const MinistrySelect = ({
  id,
  value,
  ministries,
  onChange,
}: {
  id: string;
  value: string;
  ministries: string[];
  onChange: (value: string) => void;
}) => {
  const offList = value !== "" && !ministries.includes(value);

  return (
    <Select
      value={value === "" ? NO_MINISTRY : value}
      onValueChange={(v) => onChange(v === NO_MINISTRY ? "" : v)}
    >
      <SelectTrigger id={id}>
        <SelectValue placeholder="Choose a ministry" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_MINISTRY}>No ministry</SelectItem>
        {offList && (
          <SelectItem value={value}>{value} (not on the list)</SelectItem>
        )}
        {ministries.map((name) => (
          <SelectItem key={name} value={name}>
            {name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

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
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [isEditUserOpen, setIsEditUserOpen] = useState(false);
  const [newUser, setNewUser] = useState({ email: "", password: "", full_name: "", ministry_name: "", role: "member" });
  // Most of MD's 656 logins hold 'member' — the whole Breeze import. This
  // screen is for giving somebody a job, so it lists the people who have one
  // and the members wait behind "Show members".
  const [showMembers, setShowMembers] = useState(false);
  const [search, setSearch] = useState("");
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

      // Get profiles for users in this organization, PROFILE_BATCH ids at a
      // time. `.in()` puts every id in the URL, and at 656 MD logins that URL
      // passed ~25,600 characters and the gateway answered a bare
      // "400 Bad Request" — the page read "Error loading users: Unknown error".
      const batches: string[][] = [];
      for (let i = 0; i < userIds.length; i += PROFILE_BATCH) {
        batches.push(userIds.slice(i, i + PROFILE_BATCH));
      }
      const results = await Promise.all(
        batches.map((ids) => supabase.from("profiles").select("*").in("id", ids)),
      );
      const profilesError = results.find((r) => r.error)?.error;

      if (profilesError) {
        console.error("Error fetching profiles:", profilesError);
        throw profilesError;
      }

      const profiles = results.flatMap((r) => r.data ?? []);

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


  const { data: ministries = [] } = useQuery({
    queryKey: ["branch-ministry-names", currentOrganization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .schema("budget")
        .from("ministries")
        .select("name")
        .eq("organization_id", currentOrganization!.id)
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      return (data || []).map((m) => m.name);
    },
    enabled: !!currentOrganization?.id,
  });

  const { staff, members } = useMemo(() => {
    const ranked = rankByRole(filterRoster(users, EVERYONE, search));
    return {
      staff: ranked.filter((u) => holdsAJob(u.user_roles?.[0]?.role)),
      members: ranked.filter((u) => !holdsAJob(u.user_roles?.[0]?.role)),
    };
  }, [users, search]);
  // A search looks through everyone: finding the member you are about to
  // promote is the reason to search at all.
  const membersShowing = showMembers || search.trim() !== "";
  const visibleUsers = membersShowing ? [...staff, ...members] : staff;

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

      toast({
        title: "User created",
        description: `${newUser.full_name} is ${roleLabel(newUser.role)} in ${currentOrganization.name}.`,
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
          ministry_name: editingUser.ministry_name || null,
        })
        .eq("id", editingUser.id);

      if (profileError) throw profileError;

      // Update role in user_organizations table.
      //
      // .select() is the point of this call, not decoration. Row-level
      // security refuses by matching no rows rather than by erroring, and
      // until 20260322440500 there was no admin policy here at all: every
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

      toast({
        title: "User updated",
        description: `${editingUser.full_name} is now ${roleLabel(editingUser.role)} in ${currentOrganization.name}.`,
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
                Users ({staff.length} staff
                {members.length > 0 && ` \u00b7 ${members.length} ${members.length === 1 ? "member" : "members"}`})
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
                      <Label htmlFor="ministry_name">Ministry</Label>
                      <MinistrySelect
                        id="ministry_name"
                        value={newUser.ministry_name}
                        ministries={ministries}
                        onChange={(name) => setNewUser({ ...newUser, ministry_name: name })}
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
                      <Label htmlFor="edit_ministry">Ministry</Label>
                      <MinistrySelect
                        id="edit_ministry"
                        value={editingUser?.ministry_name || ""}
                        ministries={ministries}
                        onChange={(name) => setEditingUser(editingUser ? { ...editingUser, ministry_name: name } : null)}
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
                    : search.trim()
                      ? "Nobody matches that search."
                      : members.length > 0
                        ? "Nobody here has a role yet. Show members to find someone to promote."
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
              {members.length > 0 && !search.trim() && (
                <div className="flex justify-center pt-4">
                  <Button variant="outline" size="sm" onClick={() => setShowMembers((v) => !v)}>
                    {showMembers
                      ? "Hide members"
                      : `Show members (${members.length})`}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
      </div>
    </DashboardLayout>
  );
};

export default Users;
