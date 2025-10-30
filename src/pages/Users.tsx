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
import { UserPlus, Shield, UserCog, Building2, Upload } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

const Users = () => {
  const { toast } = useToast();
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [isAddRoomOpen, setIsAddRoomOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResults, setImportResults] = useState<{ success: number; failed: number; errors: string[] } | null>(null);
  const [newUser, setNewUser] = useState({ email: "", password: "", full_name: "", role: "contributor" });
  const [newRoom, setNewRoom] = useState({ name: "", description: "", color: "#6366f1" });

  const { data: users, refetch: refetchUsers } = useQuery({
    queryKey: ["users-with-roles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select(`
          *,
          user_roles(role)
        `);

      if (error) throw error;
      return data;
    },
  });

  const { data: rooms, refetch: refetchRooms } = useQuery({
    queryKey: ["all-rooms"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rooms")
        .select("*")
        .order("name");

      if (error) throw error;
      return data;
    },
  });

  const csvData = `Ministry Name,Leader's Name,Email,phone Number 
Alic MD Prayer,Elias Adera,alicmd.Prayer@gmail.com,5712365155
Alic MD Young Adult,Eyosiyas Tegegne,alicmdmya@gmail.com,2405653856
Alic MD Decones  ,Sintayehu Alemyehu,alicmd.deacons@gmail.com,2405348391
Alic MD Women's,Hiwot Assefa,alicmd.women@gmail.com,3019154354
Alic MD Men's,Getachew Melese ,alicmd.men@gmail.com,
Alic MD Worship,Aklilu Zeleke,alicmd.@gmail.com,7039811358
Alic MD Evangelism,Pastor Benyam Aboye,alicmd.evandisc@gmail.com,2404815970
Alic MD Youth,Eyasu Gebrehiwot,alicmd.youth@gmail.com,3162827191
Alic MD True Vine,Bereket Belaye,alicmd.truevine@gmail.com,
Alic MD Ha Choir,Ermias Shigute,alicmd.hachoir@gmail.com,6513669674
Alic MD Worship B (Aroma),Mintesenot Gebre,alicmd.aroma@gmail.com,3476228398
Alic MD Children,Hiwot Kebede,alicmd.children@gmail.com,3016409686
Alic MD Home Cell,Aklilu Zeleke,alicmd.bs@gmail.com,7039811358
Alic MD Welcome,Tsiyon Mekonen,alicmd.wellcome@gmail.com,3019969374
Alic MD Senior's,Hirute Feyesa,alicmd.senior@gmail.com,2402810036
Alic MD Holistic,Temesegen Ayele,alicmd.holistic@gmail.com,2404541696
Alic MD Counseling&Marriage,Serkalem Tulu,alicmd.counmarr@gmail.com,2405957655
Alic MD Grace,DR Adam Tulu,alicmd.@gmail.com,3017285345
Alic MD Music,Samuel Giref,alicmd.music@gmail.com,2025942040
Alic MD Media,Abenezer,alicmd.media@gmail.com,2028551583
Alic MD Teaching &Dicipleshipe,Pastor Benyam Aboye,alicmd.teaching@gmail.com,2404815970
Alic MD Parking,KiduseMicael,alicmd.@gmail.com,3017932064
Alic MD IT,Admasu,alicmd.@gmail.com,
Alic MD Servant(SMT),Sidrak,alicmd.@gmail.com,2407623230
Alic Family care &connection,Pastor Dawit Dagne,alicmd.@gmail.com,5403830437
Alic MD Natanium,Lulit Berhai,alicmd@gmail.com,2022649425
Alic Adimin,Abera Debela,alicmd.admin@gmail.com,2406405123`;

  const handleImportCSV = async () => {
    setIsImporting(true);
    setImportResults(null);

    try {
      const lines = csvData.split('\n').slice(1); // Skip header
      const users = lines
        .filter(line => line.trim())
        .map(line => {
          const [ministry, name, email, phone] = line.split(',').map(s => s.trim());
          return {
            ministry,
            full_name: name,
            email,
            phone_number: phone,
          };
        });

      const { data, error } = await supabase.functions.invoke('import-users', {
        body: { users },
      });

      if (error) throw error;

      setImportResults(data);
      refetchUsers();
      
      toast({
        title: "Import Complete",
        description: `Created ${data.success} users. ${data.failed} failed.`,
      });
    } catch (error) {
      toast({
        title: "Import Error",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: newUser.email,
        password: newUser.password,
        options: {
          data: {
            full_name: newUser.full_name,
          },
        },
      });

      if (authError) throw authError;

      // Add role if needed
      if (newUser.role === "admin" && authData.user) {
        const { error: roleError } = await supabase
          .from("user_roles")
          .insert([{ user_id: authData.user.id, role: "admin" }]);

        if (roleError) throw roleError;
      }

      toast({ title: "User created successfully" });
      setIsAddUserOpen(false);
      setNewUser({ email: "", password: "", full_name: "", role: "contributor" });
      refetchUsers();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const handleAddRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase.from("rooms").insert([newRoom]);

      if (error) throw error;

      toast({ title: "Room created successfully" });
      setIsAddRoomOpen(false);
      setNewRoom({ name: "", description: "", color: "#6366f1" });
      refetchRooms();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const toggleRoomStatus = async (roomId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from("rooms")
        .update({ is_active: !currentStatus })
        .eq("id", roomId);

      if (error) throw error;

      toast({ title: `Room ${!currentStatus ? "activated" : "deactivated"}` });
      refetchRooms();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">User & Room Management</h1>
          <p className="text-muted-foreground mt-1">Manage users, roles, and rooms</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <UserCog className="h-5 w-5" />
                Users ({users?.length || 0})
              </CardTitle>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleImportCSV}
                  disabled={isImporting}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {isImporting ? "Importing..." : "Import CSV Users"}
                </Button>
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
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {importResults && (
                <Alert>
                  <AlertDescription>
                    <strong>Import Results:</strong> {importResults.success} successful, {importResults.failed} failed
                    {importResults.errors.length > 0 && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-sm">View errors</summary>
                        <ul className="mt-2 text-xs space-y-1">
                          {importResults.errors.slice(0, 10).map((error, i) => (
                            <li key={i}>• {error}</li>
                          ))}
                          {importResults.errors.length > 10 && (
                            <li>... and {importResults.errors.length - 10} more</li>
                          )}
                        </ul>
                      </details>
                    )}
                  </AlertDescription>
                </Alert>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users?.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.full_name}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        {user.user_roles && user.user_roles.length > 0 ? (
                          <Badge variant="default">
                            <Shield className="h-3 w-3 mr-1" />
                            Admin
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Contributor</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Rooms ({rooms?.length || 0})
              </CardTitle>
              <Dialog open={isAddRoomOpen} onOpenChange={setIsAddRoomOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <UserPlus className="h-4 w-4 mr-2" />
                    Add Room
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add New Room</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleAddRoom} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="room_name">Room Name *</Label>
                      <Input
                        id="room_name"
                        value={newRoom.name}
                        onChange={(e) => setNewRoom({ ...newRoom, name: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="room_description">Description</Label>
                      <Input
                        id="room_description"
                        value={newRoom.description || ""}
                        onChange={(e) => setNewRoom({ ...newRoom, description: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="room_color">Color *</Label>
                      <Input
                        id="room_color"
                        type="color"
                        value={newRoom.color}
                        onChange={(e) => setNewRoom({ ...newRoom, color: e.target.value })}
                        required
                      />
                    </div>
                    <Button type="submit" className="w-full">Create Room</Button>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rooms?.map((room) => (
                    <TableRow key={room.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-4 h-4 rounded"
                            style={{ backgroundColor: room.color || "#6366f1" }}
                          />
                          {room.name}
                        </div>
                      </TableCell>
                      <TableCell>{room.description || "-"}</TableCell>
                      <TableCell>
                        <Badge variant={room.is_active ? "default" : "secondary"}>
                          {room.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => toggleRoomStatus(room.id, room.is_active)}
                        >
                          {room.is_active ? "Deactivate" : "Activate"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Users;
