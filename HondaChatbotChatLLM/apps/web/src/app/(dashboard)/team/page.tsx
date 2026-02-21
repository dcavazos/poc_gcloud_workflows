"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Plus, Users, Users2, Loader2, MoreVertical, Trash2, Shield, UserCog } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";

interface TeamMember {
  id: string;
  name: string;
  email: string;
  photoURL: string | null;
  role: "admin" | "agent" | "viewer";
  isAvailable: boolean;
  activeConversations: number;
  teamId: string | null;
  lastLoginAt: Date | null;
}

interface Team {
  id: string;
  name: string;
}

export default function TeamPage() {
  const { userData, user } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"agent" | "viewer">("agent");
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    if (!userData?.organizationId) {
      setLoading(false);
      return;
    }

    const usersRef = collection(db, "users");
    const q = query(usersRef, where("organizationId", "==", userData.organizationId));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const teamMembers: TeamMember[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          teamMembers.push({
            id: doc.id,
            name: data.name || data.email?.split("@")[0] || "Sin nombre",
            email: data.email || "",
            photoURL: data.photoURL || null,
            role: data.role || "viewer",
            isAvailable: data.isAvailable ?? true,
            activeConversations: data.activeConversations || 0,
            teamId: data.teamId || null,
            lastLoginAt: data.lastLoginAt?.toDate?.() ?? null,
          });
        });
        setMembers(teamMembers);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching team members:", error);
        setLoading(false);
      }
    );

    // Subscribe to teams
    const teamsRef = collection(db, "teams");
    const teamsQuery = query(teamsRef, where("organizationId", "==", userData.organizationId));
    const unsubTeams = onSnapshot(teamsQuery, (snapshot) => {
      const teamsData: Team[] = [];
      snapshot.forEach((doc) => {
        teamsData.push({ id: doc.id, name: doc.data().name });
      });
      setTeams(teamsData);
    });

    return () => {
      unsubscribe();
      unsubTeams();
    };
  }, [userData?.organizationId]);

  const handleChangeRole = async (memberId: string, newRole: "admin" | "agent" | "viewer") => {
    try {
      await updateDoc(doc(db, "users", memberId), { role: newRole });
    } catch (error) {
      console.error("Error changing role:", error);
      alert("Error al cambiar el rol");
    }
  };

  const handleToggleAvailability = async (memberId: string, currentAvailability: boolean) => {
    try {
      await updateDoc(doc(db, "users", memberId), { isAvailable: !currentAvailability });
    } catch (error) {
      console.error("Error toggling availability:", error);
      alert("Error al cambiar disponibilidad");
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm("¿Estas seguro de que deseas eliminar a este miembro del equipo?")) return;

    try {
      await updateDoc(doc(db, "users", memberId), {
        organizationId: null,
        role: "viewer"
      });
    } catch (error) {
      console.error("Error removing member:", error);
      alert("Error al eliminar miembro");
    }
  };

  const handleChangeTeam = async (memberId: string, teamId: string | null) => {
    try {
      await updateDoc(doc(db, "users", memberId), { teamId });
    } catch (error) {
      console.error("Error changing team:", error);
      alert("Error al cambiar equipo");
    }
  };

  const getTeamName = (teamId: string | null) => {
    if (!teamId) return "Sin equipo";
    const team = teams.find(t => t.id === teamId);
    return team?.name || "Sin equipo";
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;

    setInviting(true);
    try {
      const token = await user?.getIdToken();
      const res = await fetch("/api/invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Error al enviar invitación");
        return;
      }

      toast.success(`Invitación enviada a ${inviteEmail}`);
      setInviteDialogOpen(false);
      setInviteEmail("");
    } catch (error) {
      console.error("Error inviting:", error);
      toast.error("Error al enviar invitación");
    } finally {
      setInviting(false);
    }
  };

  const isCurrentUserAdmin = userData?.role === "admin";

  const roleLabels = {
    admin: "Administrador",
    agent: "Agente",
    viewer: "Observador",
  };

  const roleColors = {
    admin: "bg-purple-100 text-purple-800",
    agent: "bg-blue-100 text-blue-800",
    viewer: "bg-gray-100 text-gray-800",
  };

  if (!userData?.organizationId) {
    return (
      <div>
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Equipo</h1>
          <p className="text-gray-500">Gestiona los miembros de tu equipo</p>
        </div>
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-gray-500">
              Necesitas pertenecer a una organización para ver el equipo.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Equipo</h1>
          <p className="text-gray-500">
            {members.length} miembro{members.length !== 1 ? "s" : ""} en tu equipo
          </p>
        </div>
        {isCurrentUserAdmin && (
          <Button onClick={() => setInviteDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Invitar
          </Button>
        )}
      </div>

      {members.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-gray-100 p-4 mb-4">
              <Users className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium mb-2">
              Tu equipo está vacío
            </h3>
            <p className="text-gray-500 text-center mb-4">
              Invita a miembros de tu equipo para que puedan atender
              conversaciones.
            </p>
            {isCurrentUserAdmin && (
              <Button onClick={() => setInviteDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Invitar
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {members.map((member) => (
            <Card key={member.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <Avatar>
                      <AvatarImage src={member.photoURL || undefined} />
                      <AvatarFallback>
                        {member.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span
                      className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white ${
                        member.isAvailable ? "bg-green-500" : "bg-gray-400"
                      }`}
                      title={member.isAvailable ? "Disponible" : "No disponible"}
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{member.name}</p>
                      {member.id === user?.uid && (
                        <Badge variant="outline" className="text-xs">Tú</Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">{member.email}</p>
                    <p className="text-xs text-gray-400">
                      {member.lastLoginAt
                        ? `Ultimo login: ${formatDistanceToNow(member.lastLoginAt, { addSuffix: true, locale: es })}`
                        : "Ultimo login: Nunca"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {member.role === "agent" && (
                    <span className="text-sm text-gray-500">
                      {member.activeConversations} conv. activas
                    </span>
                  )}
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Users2 className="h-3 w-3" />
                    {getTeamName(member.teamId)}
                  </Badge>
                  <Badge className={roleColors[member.role]}>
                    {roleLabels[member.role]}
                  </Badge>
                  {isCurrentUserAdmin && member.id !== user?.uid && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleToggleAvailability(member.id, member.isAvailable)}>
                          <UserCog className="mr-2 h-4 w-4" />
                          {member.isAvailable ? "Marcar no disponible" : "Marcar disponible"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleChangeRole(member.id, "admin")}>
                          <Shield className="mr-2 h-4 w-4" />
                          Hacer Administrador
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleChangeRole(member.id, "agent")}>
                          <Users className="mr-2 h-4 w-4" />
                          Hacer Agente
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleChangeRole(member.id, "viewer")}>
                          <Users className="mr-2 h-4 w-4" />
                          Hacer Observador
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {teams.length > 0 && (
                          <>
                            <DropdownMenuItem disabled className="text-xs text-gray-500">
                              Asignar a equipo:
                            </DropdownMenuItem>
                            {teams.map((team) => (
                              <DropdownMenuItem
                                key={team.id}
                                onClick={() => handleChangeTeam(member.id, team.id)}
                              >
                                <Users2 className="mr-2 h-4 w-4" />
                                {team.name}
                                {member.teamId === team.id && " (actual)"}
                              </DropdownMenuItem>
                            ))}
                            <DropdownMenuItem onClick={() => handleChangeTeam(member.id, null)}>
                              <Users2 className="mr-2 h-4 w-4" />
                              Sin equipo
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                          </>
                        )}
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={() => handleRemoveMember(member.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Eliminar del equipo
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Invite Dialog */}
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invitar miembro</DialogTitle>
            <DialogDescription>
              Envía una invitación por email para unirse a tu equipo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
                type="email"
                placeholder="correo@ejemplo.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Rol</Label>
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as "agent" | "viewer")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="agent">Agente</SelectItem>
                  <SelectItem value="viewer">Observador</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()}>
              {inviting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Enviar invitación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
