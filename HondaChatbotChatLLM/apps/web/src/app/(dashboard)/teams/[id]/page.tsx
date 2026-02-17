"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft,
  Save,
  Loader2,
  Users2,
  Phone,
  Plus,
  MoreVertical,
  Trash2,
  UserPlus,
  Settings,
} from "lucide-react";
import { db } from "@/lib/firebase";
import {
  doc,
  collection,
  query,
  where,
  onSnapshot,
  updateDoc,
} from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";

interface TeamData {
  id: string;
  name: string;
  description: string;
  assignmentMode: "round_robin" | "least_busy" | "manual";
  maxConversationsPerAgent: number;
  activeConversations: number;
  status: "active" | "inactive";
  organizationId: string;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  photoURL: string | null;
  role: "admin" | "agent" | "viewer";
  isAvailable: boolean;
  activeConversations: number;
  teamId: string | null;
}

interface WhatsAppNumber {
  id: string;
  phoneNumber: string;
  displayName: string;
  teamId: string | null;
  status: "active" | "inactive";
}

export default function TeamDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { userData } = useAuth();
  const teamId = params.id as string;

  const [team, setTeam] = useState<TeamData | null>(null);
  const [allMembers, setAllMembers] = useState<TeamMember[]>([]);
  const [allNumbers, setAllNumbers] = useState<WhatsAppNumber[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form states for General tab
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formStatus, setFormStatus] = useState<"active" | "inactive">("active");

  // Form states for Config tab
  const [formAssignmentMode, setFormAssignmentMode] = useState<"round_robin" | "least_busy" | "manual">("least_busy");
  const [formMaxConversations, setFormMaxConversations] = useState(10);

  // Dialog states
  const [addAgentDialogOpen, setAddAgentDialogOpen] = useState(false);
  const [addNumberDialogOpen, setAddNumberDialogOpen] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [selectedNumberId, setSelectedNumberId] = useState("");

  const isAdmin = userData?.role === "admin";

  // Subscribe to team document
  useEffect(() => {
    if (!teamId) return;

    const unsubTeam = onSnapshot(
      doc(db, "teams", teamId),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = { id: snapshot.id, ...snapshot.data() } as TeamData;
          setTeam(data);
          setFormName(data.name || "");
          setFormDescription(data.description || "");
          setFormStatus(data.status || "active");
          setFormAssignmentMode(data.assignmentMode || "least_busy");
          setFormMaxConversations(data.maxConversationsPerAgent || 10);
        } else {
          setTeam(null);
        }
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching team:", error);
        setLoading(false);
      }
    );

    return () => unsubTeam();
  }, [teamId]);

  // Subscribe to all org members
  useEffect(() => {
    if (!userData?.organizationId) return;

    const usersRef = collection(db, "users");
    const usersQuery = query(usersRef, where("organizationId", "==", userData.organizationId));

    const unsubUsers = onSnapshot(usersQuery, (snapshot) => {
      const usersData: TeamMember[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        usersData.push({
          id: doc.id,
          name: data.name || data.email?.split("@")[0] || "Sin nombre",
          email: data.email || "",
          photoURL: data.photoURL || null,
          role: data.role || "viewer",
          isAvailable: data.isAvailable ?? true,
          activeConversations: data.activeConversations || 0,
          teamId: data.teamId || null,
        });
      });
      setAllMembers(usersData);
    });

    return () => unsubUsers();
  }, [userData?.organizationId]);

  // Subscribe to all org WhatsApp numbers
  useEffect(() => {
    if (!userData?.organizationId) return;

    const numbersRef = collection(db, "whatsappNumbers");
    const numbersQuery = query(numbersRef, where("organizationId", "==", userData.organizationId));

    const unsubNumbers = onSnapshot(numbersQuery, (snapshot) => {
      const numbersData: WhatsAppNumber[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        numbersData.push({
          id: doc.id,
          phoneNumber: data.phoneNumber || "",
          displayName: data.displayName || "",
          teamId: data.teamId || null,
          status: data.status || "inactive",
        });
      });
      setAllNumbers(numbersData);
    });

    return () => unsubNumbers();
  }, [userData?.organizationId]);

  const teamMembers = allMembers.filter((m) => m.teamId === teamId);
  const availableMembers = allMembers.filter((m) => !m.teamId || m.teamId !== teamId);
  const teamNumbers = allNumbers.filter((n) => n.teamId === teamId);
  const availableNumbers = allNumbers.filter((n) => !n.teamId || n.teamId !== teamId);

  const handleSaveGeneral = async () => {
    if (!team || !formName.trim()) return;

    setSaving(true);
    try {
      await updateDoc(doc(db, "teams", team.id), {
        name: formName.trim(),
        description: formDescription.trim(),
        status: formStatus,
      });
    } catch (error) {
      console.error("Error saving team:", error);
      alert("Error al guardar los cambios");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!team) return;

    setSaving(true);
    try {
      await updateDoc(doc(db, "teams", team.id), {
        assignmentMode: formAssignmentMode,
        maxConversationsPerAgent: formMaxConversations,
      });
    } catch (error) {
      console.error("Error saving config:", error);
      alert("Error al guardar la configuracion");
    } finally {
      setSaving(false);
    }
  };

  const handleAddAgent = async () => {
    if (!selectedAgentId) return;

    try {
      await updateDoc(doc(db, "users", selectedAgentId), { teamId });
      setAddAgentDialogOpen(false);
      setSelectedAgentId("");
    } catch (error) {
      console.error("Error adding agent:", error);
      alert("Error al agregar agente");
    }
  };

  const handleRemoveAgent = async (memberId: string) => {
    try {
      await updateDoc(doc(db, "users", memberId), { teamId: null });
    } catch (error) {
      console.error("Error removing agent:", error);
      alert("Error al quitar agente");
    }
  };

  const handleAddNumber = async () => {
    if (!selectedNumberId) return;

    try {
      await updateDoc(doc(db, "whatsappNumbers", selectedNumberId), { teamId });
      setAddNumberDialogOpen(false);
      setSelectedNumberId("");
    } catch (error) {
      console.error("Error adding number:", error);
      alert("Error al asignar numero");
    }
  };

  const handleRemoveNumber = async (numberId: string) => {
    try {
      await updateDoc(doc(db, "whatsappNumbers", numberId), { teamId: null });
    } catch (error) {
      console.error("Error removing number:", error);
      alert("Error al quitar numero");
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const assignmentModeLabels: Record<string, string> = {
    round_robin: "Round Robin",
    least_busy: "Menos ocupado",
    manual: "Manual",
  };

  const roleLabels: Record<string, string> = {
    admin: "Administrador",
    agent: "Agente",
    viewer: "Observador",
  };

  const roleColors: Record<string, string> = {
    admin: "bg-purple-100 text-purple-800",
    agent: "bg-blue-100 text-blue-800",
    viewer: "bg-gray-100 text-gray-800",
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!team) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Equipo no encontrado</p>
        <Link href="/teams">
          <Button variant="link">Volver a Equipos</Button>
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link href="/teams">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{team.name}</h1>
            <Badge variant={team.status === "active" ? "default" : "secondary"}>
              {team.status === "active" ? "Activo" : "Inactivo"}
            </Badge>
          </div>
          <p className="text-gray-500">
            {teamMembers.length} agente{teamMembers.length !== 1 ? "s" : ""} · {teamNumbers.length} numero{teamNumbers.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="general" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="agents">Agentes</TabsTrigger>
          <TabsTrigger value="numbers">Numeros</TabsTrigger>
          <TabsTrigger value="config">Configuracion</TabsTrigger>
        </TabsList>

        {/* General Tab */}
        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>Informacion General</CardTitle>
              <CardDescription>
                Nombre, descripcion y estado del equipo
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="team-name">Nombre del equipo</Label>
                <Input
                  id="team-name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ej: Ventas, Soporte, etc."
                  disabled={!isAdmin}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="team-description">Descripcion</Label>
                <Input
                  id="team-description"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Descripcion del equipo"
                  disabled={!isAdmin}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="team-status">Estado</Label>
                <Select
                  value={formStatus}
                  onValueChange={(v) => setFormStatus(v as "active" | "inactive")}
                  disabled={!isAdmin}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Activo</SelectItem>
                    <SelectItem value="inactive">Inactivo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {isAdmin && (
                <div className="pt-4">
                  <Button onClick={handleSaveGeneral} disabled={saving || !formName.trim()}>
                    {saving ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Guardar Cambios
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Agents Tab */}
        <TabsContent value="agents">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Agentes del Equipo</CardTitle>
                <CardDescription>
                  {teamMembers.length} agente{teamMembers.length !== 1 ? "s" : ""} asignado{teamMembers.length !== 1 ? "s" : ""}
                </CardDescription>
              </div>
              {isAdmin && (
                <Button
                  onClick={() => {
                    setSelectedAgentId("");
                    setAddAgentDialogOpen(true);
                  }}
                  size="sm"
                >
                  <UserPlus className="mr-2 h-4 w-4" />
                  Agregar Agente
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {teamMembers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <div className="rounded-full bg-gray-100 p-4 mb-4">
                    <Users2 className="h-8 w-8 text-gray-400" />
                  </div>
                  <p className="text-gray-500 text-center mb-2">
                    No hay agentes en este equipo
                  </p>
                  <p className="text-sm text-gray-400 text-center">
                    Agrega agentes para que puedan atender conversaciones de este equipo.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {teamMembers.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-3 rounded-lg border"
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <Avatar className="h-9 w-9">
                            <AvatarImage src={member.photoURL || undefined} />
                            <AvatarFallback className="text-xs">
                              {getInitials(member.name)}
                            </AvatarFallback>
                          </Avatar>
                          <span
                            className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white ${
                              member.isAvailable ? "bg-green-500" : "bg-gray-400"
                            }`}
                          />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{member.name}</p>
                          <p className="text-xs text-gray-500">{member.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {member.role === "agent" && (
                          <span className="text-xs text-gray-500">
                            {member.activeConversations} conv.
                          </span>
                        )}
                        <Badge className={`text-xs ${roleColors[member.role]}`}>
                          {roleLabels[member.role]}
                        </Badge>
                        {isAdmin && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                className="text-red-600"
                                onClick={() => handleRemoveAgent(member.id)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Quitar del equipo
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Numbers Tab */}
        <TabsContent value="numbers">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Numeros de WhatsApp</CardTitle>
                <CardDescription>
                  {teamNumbers.length} numero{teamNumbers.length !== 1 ? "s" : ""} asignado{teamNumbers.length !== 1 ? "s" : ""}
                </CardDescription>
              </div>
              {isAdmin && (
                <Button
                  onClick={() => {
                    setSelectedNumberId("");
                    setAddNumberDialogOpen(true);
                  }}
                  size="sm"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Asignar Numero
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {teamNumbers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <div className="rounded-full bg-gray-100 p-4 mb-4">
                    <Phone className="h-8 w-8 text-gray-400" />
                  </div>
                  <p className="text-gray-500 text-center mb-2">
                    No hay numeros asignados a este equipo
                  </p>
                  <p className="text-sm text-gray-400 text-center">
                    Asigna numeros de WhatsApp para recibir conversaciones en este equipo.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {teamNumbers.map((num) => (
                    <div
                      key={num.id}
                      className="flex items-center justify-between p-3 rounded-lg border"
                    >
                      <div className="flex items-center gap-3">
                        <div className="rounded-full bg-green-100 p-2">
                          <Phone className="h-4 w-4 text-green-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">
                            {num.displayName || num.phoneNumber}
                          </p>
                          {num.displayName && (
                            <p className="text-xs text-gray-500">{num.phoneNumber}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={num.status === "active" ? "default" : "secondary"}>
                          {num.status === "active" ? "Activo" : "Inactivo"}
                        </Badge>
                        {isAdmin && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                className="text-red-600"
                                onClick={() => handleRemoveNumber(num.id)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Quitar del equipo
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Config Tab */}
        <TabsContent value="config">
          <Card>
            <CardHeader>
              <CardTitle>Configuracion Avanzada</CardTitle>
              <CardDescription>
                Modo de asignacion y limites del equipo
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="assignment-mode">Modo de asignacion</Label>
                <Select
                  value={formAssignmentMode}
                  onValueChange={(v) => setFormAssignmentMode(v as typeof formAssignmentMode)}
                  disabled={!isAdmin}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="least_busy">Menos ocupado</SelectItem>
                    <SelectItem value="round_robin">Round Robin</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500">
                  {formAssignmentMode === "least_busy" && "Las conversaciones se asignan al agente con menos conversaciones activas."}
                  {formAssignmentMode === "round_robin" && "Las conversaciones se asignan de forma rotativa entre los agentes."}
                  {formAssignmentMode === "manual" && "Las conversaciones se asignan manualmente por un administrador."}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="max-conversations">Max conversaciones por agente</Label>
                <Input
                  id="max-conversations"
                  type="number"
                  min={1}
                  max={50}
                  value={formMaxConversations}
                  onChange={(e) => setFormMaxConversations(parseInt(e.target.value) || 10)}
                  disabled={!isAdmin}
                />
                <p className="text-xs text-gray-500">
                  Numero maximo de conversaciones simultaneas que puede atender un agente.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Conversaciones activas</Label>
                <div>
                  <Badge variant="outline" className="text-sm">
                    {team.activeConversations || 0} conversaciones activas
                  </Badge>
                </div>
              </div>
              {isAdmin && (
                <div className="pt-4">
                  <Button onClick={handleSaveConfig} disabled={saving}>
                    {saving ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Guardar Configuracion
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Agent Dialog */}
      <Dialog open={addAgentDialogOpen} onOpenChange={setAddAgentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar Agente al Equipo</DialogTitle>
            <DialogDescription>
              Selecciona un agente para agregarlo a {team.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {availableMembers.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">
                No hay agentes disponibles para agregar.
              </p>
            ) : (
              <div className="space-y-2">
                <Label>Agente</Label>
                <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un agente" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableMembers.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.name} ({member.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddAgentDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleAddAgent}
              disabled={!selectedAgentId || availableMembers.length === 0}
            >
              Agregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Number Dialog */}
      <Dialog open={addNumberDialogOpen} onOpenChange={setAddNumberDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Asignar Numero al Equipo</DialogTitle>
            <DialogDescription>
              Selecciona un numero de WhatsApp para asignarlo a {team.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {availableNumbers.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">
                No hay numeros disponibles para asignar.
              </p>
            ) : (
              <div className="space-y-2">
                <Label>Numero de WhatsApp</Label>
                <Select value={selectedNumberId} onValueChange={setSelectedNumberId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un numero" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableNumbers.map((num) => (
                      <SelectItem key={num.id} value={num.id}>
                        {num.displayName || num.phoneNumber}
                        {num.displayName ? ` (${num.phoneNumber})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddNumberDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleAddNumber}
              disabled={!selectedNumberId || availableNumbers.length === 0}
            >
              Asignar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
