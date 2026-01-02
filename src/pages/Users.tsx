import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Shield, UserCog, Pencil, Trash2 } from "lucide-react";
import { useOrganization } from "@/contexts/OrganizationContext";

const Users = () => {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [isEditUserOpen, setIsEditUserOpen] = useState(false);
  const [newUser, setNewUser] = useState({ email: "", password: "", full_name: "", ministry_name: "", role: "contributor" });
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

      toast({ title: "User created successfully" });
      setIsAddUserOpen(false);
      setNewUser({ email: "", password: "", full_name: "", ministry_name: "", role: "contributor" });
      refetchUsers();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An error occurred",
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

      // Update role in user_organizations table
      const { error: roleError } = await supabase
        .from("user_organizations")
        .update({ role: editingUser.role as "admin" | "contributor" })
        .eq("user_id", editingUser.id)
        .eq("organization_id", currentOrganization.id);

      if (roleError) throw roleError;

      toast({ title: "User updated successfully" });
      setIsEditUserOpen(false);
      setEditingUser(null);
      refetchUsers();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An error occurred",
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
      const { error: orgError } = await supabase
        .from("user_organizations")
        .delete()
        .eq("user_id", userId)
        .eq("organization_id", currentOrganization.id);

      if (orgError) throw orgError;

      // Note: We don't delete the profile or auth user since they may belong to other organizations
      // The profile is only deleted if this was their only organization

      toast({ title: "User removed from organization successfully" });
      await refetchUsers();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An error occurred",
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
      role: user.user_roles && user.user_roles.some(r => r.role === 'admin') ? "admin" : "contributor",
    });
    setIsEditUserOpen(true);
  };


  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">User Management</h1>
          <p className="text-muted-foreground mt-1">Manage users and roles</p>
        </div>

        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <UserCog className="h-5 w-5" />
                Users ({users?.length || 0})
              </CardTitle>
              <Dialog open={isAddUserOpen} onOpenChange={setIsAddUserOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
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
                          <SelectItem value="contributor">Contributor</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
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
                          <SelectItem value="contributor">Contributor</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button type="submit" className="w-full">Update User</Button>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {usersError && (
                <div className="text-sm text-destructive mb-4">
                  Error loading users: {usersError instanceof Error ? usersError.message : "Unknown error"}
                </div>
              )}
              {!users || users.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {usersError ? "Failed to load users." : "No users found. Add users using the 'Add User' button above."}
                </div>
              ) : (
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
                    {users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.full_name}</TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>{user.phone_number || "-"}</TableCell>
                        <TableCell>{user.ministry_name || "-"}</TableCell>
                        <TableCell>
                          {user.user_roles && user.user_roles.some(r => r.role === 'admin') ? (
                            <Badge variant="default">
                              <Shield className="h-3 w-3 mr-1" />
                              Admin
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Contributor</Badge>
                          )}
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
              )}
            </CardContent>
          </Card>
      </div>
    </DashboardLayout>
  );
};

export default Users;
