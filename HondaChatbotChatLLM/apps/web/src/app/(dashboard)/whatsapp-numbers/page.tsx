"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Phone,
  Plus,
  Loader2,
  MoreVertical,
  Pencil,
  Trash2,
  Bot,
  Users2,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
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
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";

interface WhatsAppNumber {
  id: string;
  phoneNumber: string;
  displayName: string;
  provider: "twilio" | "valuetext";
  twilioAccountSid: string;
  twilioAuthToken: string;
  valuetextSenderId: string;
  teamId: string | null;
  defaultBotId: string | null;
  status: "active" | "inactive";
}

interface Team {
  id: string;
  name: string;
}

interface BotItem {
  id: string;
  name: string;
}

export default function WhatsAppNumbersPage() {
  const { userData } = useAuth();
  const [numbers, setNumbers] = useState<WhatsAppNumber[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [bots, setBots] = useState<BotItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedNumber, setSelectedNumber] = useState<WhatsAppNumber | null>(null);

  // Form states
  const [formPhoneNumber, setFormPhoneNumber] = useState("");
  const [formDisplayName, setFormDisplayName] = useState("");
  const [formProvider, setFormProvider] = useState<"twilio" | "valuetext">("twilio");
  const [formAccountSid, setFormAccountSid] = useState("");
  const [formAuthToken, setFormAuthToken] = useState("");
  const [formValuetextSenderId, setFormValuetextSenderId] = useState("");
  const [formTeamId, setFormTeamId] = useState<string>("");
  const [formBotId, setFormBotId] = useState<string>("");
  const [showAuthToken, setShowAuthToken] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userData?.organizationId) {
      setLoading(false);
      return;
    }

    // Subscribe to WhatsApp numbers
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
          provider: data.provider || "twilio",
          twilioAccountSid: data.twilioAccountSid || "",
          twilioAuthToken: data.twilioAuthToken || "",
          valuetextSenderId: data.valuetextSenderId || "",
          teamId: data.teamId || null,
          defaultBotId: data.defaultBotId || null,
          status: data.status || "active",
        });
      });
      setNumbers(numbersData);
      setLoading(false);
    });

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

    // Subscribe to bots
    const botsRef = collection(db, "bots");
    const botsQuery = query(botsRef, where("organizationId", "==", userData.organizationId));

    const unsubBots = onSnapshot(botsQuery, (snapshot) => {
      const botsData: BotItem[] = [];
      snapshot.forEach((doc) => {
        botsData.push({ id: doc.id, name: doc.data().name || "Sin nombre" });
      });
      setBots(botsData);
    });

    return () => {
      unsubNumbers();
      unsubTeams();
      unsubBots();
    };
  }, [userData?.organizationId]);

  const resetForm = () => {
    setFormPhoneNumber("");
    setFormDisplayName("");
    setFormProvider("twilio");
    setFormAccountSid("");
    setFormAuthToken("");
    setFormValuetextSenderId("");
    setFormTeamId("");
    setFormBotId("");
    setShowAuthToken(false);
    setSelectedNumber(null);
  };

  const handleCreate = async () => {
    if (!formPhoneNumber.trim() || !userData?.organizationId) return;

    setSaving(true);
    try {
      // Format phone number with whatsapp: prefix if not present
      let phoneNumber = formPhoneNumber.trim();
      if (!phoneNumber.startsWith("whatsapp:")) {
        phoneNumber = `whatsapp:${phoneNumber}`;
      }

      const docData: Record<string, unknown> = {
        organizationId: userData.organizationId,
        phoneNumber,
        displayName: formDisplayName.trim() || phoneNumber,
        provider: formProvider,
        teamId: formTeamId || null,
        defaultBotId: formBotId || null,
        status: "active",
        createdAt: serverTimestamp(),
      };

      if (formProvider === "twilio") {
        docData.twilioAccountSid = formAccountSid.trim();
        docData.twilioAuthToken = formAuthToken.trim();
      } else {
        docData.valuetextSenderId = formValuetextSenderId.trim();
      }

      await addDoc(collection(db, "whatsappNumbers"), docData);
      setCreateDialogOpen(false);
      resetForm();
    } catch (error) {
      console.error("Error creating WhatsApp number:", error);
      alert("Error al crear el numero de WhatsApp");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!selectedNumber || !formPhoneNumber.trim()) return;

    setSaving(true);
    try {
      let phoneNumber = formPhoneNumber.trim();
      if (!phoneNumber.startsWith("whatsapp:")) {
        phoneNumber = `whatsapp:${phoneNumber}`;
      }

      const updateData: Record<string, unknown> = {
        phoneNumber,
        displayName: formDisplayName.trim() || phoneNumber,
        provider: formProvider,
        teamId: formTeamId || null,
        defaultBotId: formBotId || null,
      };

      if (formProvider === "twilio") {
        updateData.twilioAccountSid = formAccountSid.trim();
        // Only update auth token if it was changed
        if (formAuthToken && formAuthToken !== "********") {
          updateData.twilioAuthToken = formAuthToken.trim();
        }
      } else {
        updateData.valuetextSenderId = formValuetextSenderId.trim();
      }

      await updateDoc(doc(db, "whatsappNumbers", selectedNumber.id), updateData);
      setEditDialogOpen(false);
      resetForm();
    } catch (error) {
      console.error("Error updating WhatsApp number:", error);
      alert("Error al actualizar el numero");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (numberId: string) => {
    if (!confirm("Estas seguro de que deseas eliminar este numero de WhatsApp?")) return;

    try {
      await deleteDoc(doc(db, "whatsappNumbers", numberId));
    } catch (error) {
      console.error("Error deleting WhatsApp number:", error);
      alert("Error al eliminar el numero");
    }
  };

  const handleToggleStatus = async (number: WhatsAppNumber) => {
    try {
      await updateDoc(doc(db, "whatsappNumbers", number.id), {
        status: number.status === "active" ? "inactive" : "active",
      });
    } catch (error) {
      console.error("Error toggling status:", error);
      alert("Error al cambiar el estado");
    }
  };

  const openEditDialog = (number: WhatsAppNumber) => {
    setSelectedNumber(number);
    setFormPhoneNumber(number.phoneNumber.replace("whatsapp:", ""));
    setFormDisplayName(number.displayName);
    setFormProvider(number.provider);
    setFormAccountSid(number.twilioAccountSid);
    setFormAuthToken("********"); // Masked
    setFormValuetextSenderId(number.valuetextSenderId);
    setFormTeamId(number.teamId || "");
    setFormBotId(number.defaultBotId || "");
    setShowAuthToken(false);
    setEditDialogOpen(true);
  };

  const getTeamName = (teamId: string | null) => {
    if (!teamId) return "Sin equipo";
    const team = teams.find((t) => t.id === teamId);
    return team?.name || "Sin equipo";
  };

  const getBotName = (botId: string | null) => {
    if (!botId) return "Sin bot";
    const bot = bots.find((b) => b.id === botId);
    return bot?.name || "Sin bot";
  };

  const isCurrentUserAdmin = userData?.role === "admin";

  if (!userData?.organizationId) {
    return (
      <div>
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Numeros de WhatsApp</h1>
          <p className="text-gray-500">Gestiona tus numeros de WhatsApp Business</p>
        </div>
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-gray-500">
              Necesitas pertenecer a una organizacion para ver los numeros.
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

  // Provider-specific fields for create/edit dialogs
  const providerFields = (idPrefix: string) => (
    <>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-provider`}>Proveedor</Label>
        <Select value={formProvider} onValueChange={(v) => setFormProvider(v as "twilio" | "valuetext")}>
          <SelectTrigger>
            <SelectValue placeholder="Seleccionar proveedor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="twilio">Twilio</SelectItem>
            <SelectItem value="valuetext">ValueText</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {formProvider === "twilio" ? (
        <>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-accountSid`}>Twilio Account SID</Label>
            <Input
              id={`${idPrefix}-accountSid`}
              placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              value={formAccountSid}
              onChange={(e) => setFormAccountSid(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-authToken`}>Twilio Auth Token</Label>
            <div className="relative">
              <Input
                id={`${idPrefix}-authToken`}
                type={showAuthToken ? "text" : "password"}
                placeholder={idPrefix === "edit" ? "Dejar vacio para mantener actual" : "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}
                value={formAuthToken}
                onChange={(e) => setFormAuthToken(e.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setShowAuthToken(!showAuthToken)}
              >
                {showAuthToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            {idPrefix === "edit" && (
              <p className="text-xs text-gray-500">Dejar como ******** para no cambiar</p>
            )}
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-senderId`}>Sender ID (ValueText)</Label>
          <Input
            id={`${idPrefix}-senderId`}
            placeholder="Identificador del remitente en ValueText"
            value={formValuetextSenderId}
            onChange={(e) => setFormValuetextSenderId(e.target.value)}
          />
        </div>
      )}
    </>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Numeros de WhatsApp</h1>
          <p className="text-gray-500">
            {numbers.length} numero{numbers.length !== 1 ? "s" : ""} configurado{numbers.length !== 1 ? "s" : ""}
          </p>
        </div>
        {isCurrentUserAdmin && (
          <Button onClick={() => { resetForm(); setCreateDialogOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            Agregar Numero
          </Button>
        )}
      </div>

      {numbers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-gray-100 p-4 mb-4">
              <Phone className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium mb-2">
              No hay numeros configurados
            </h3>
            <p className="text-gray-500 text-center mb-4">
              Agrega numeros de WhatsApp Business para recibir mensajes.
            </p>
            {isCurrentUserAdmin && (
              <Button onClick={() => { resetForm(); setCreateDialogOpen(true); }}>
                <Plus className="mr-2 h-4 w-4" />
                Agregar Numero
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {numbers.map((number) => (
            <Card key={number.id}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Phone className="h-5 w-5 text-green-600" />
                    {number.displayName}
                  </CardTitle>
                  <p className="text-sm text-gray-500 mt-1 font-mono">
                    {number.phoneNumber.replace("whatsapp:", "")}
                  </p>
                </div>
                {isCurrentUserAdmin && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEditDialog(number)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleToggleStatus(number)}>
                        {number.status === "active" ? (
                          <>
                            <EyeOff className="mr-2 h-4 w-4" />
                            Desactivar
                          </>
                        ) : (
                          <>
                            <Eye className="mr-2 h-4 w-4" />
                            Activar
                          </>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-red-600"
                        onClick={() => handleDelete(number.id)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge variant={number.status === "active" ? "default" : "secondary"}>
                      {number.status === "active" ? "Activo" : "Inactivo"}
                    </Badge>
                    <Badge variant="outline" className={number.provider === "twilio" ? "border-green-500 text-green-700" : "border-purple-500 text-purple-700"}>
                      {number.provider === "twilio" ? "Twilio" : "ValueText"}
                    </Badge>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Users2 className="h-4 w-4 text-gray-400" />
                      <span>Equipo: {getTeamName(number.teamId)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4 text-gray-400" />
                      <span>Bot: {getBotName(number.defaultBotId)}</span>
                    </div>
                  </div>

                  {number.provider === "twilio" && number.twilioAccountSid && (
                    <div className="pt-2 border-t">
                      <p className="text-xs text-gray-500">
                        Account SID: {number.twilioAccountSid.slice(0, 8)}...
                      </p>
                    </div>
                  )}
                  {number.provider === "valuetext" && number.valuetextSenderId && (
                    <div className="pt-2 border-t">
                      <p className="text-xs text-gray-500">
                        Sender ID: {number.valuetextSenderId}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Agregar Numero de WhatsApp</DialogTitle>
            <DialogDescription>
              Configura un nuevo numero de WhatsApp Business.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="phoneNumber">Numero de telefono</Label>
              <Input
                id="phoneNumber"
                placeholder="+528120854452"
                value={formPhoneNumber}
                onChange={(e) => setFormPhoneNumber(e.target.value)}
              />
              <p className="text-xs text-gray-500">Formato: +[codigo pais][numero]</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="displayName">Nombre para mostrar</Label>
              <Input
                id="displayName"
                placeholder="Ventas WhatsApp"
                value={formDisplayName}
                onChange={(e) => setFormDisplayName(e.target.value)}
              />
            </div>

            {providerFields("create")}

            <div className="space-y-2">
              <Label htmlFor="teamId">Equipo</Label>
              <Select value={formTeamId} onValueChange={setFormTeamId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar equipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sin equipo</SelectItem>
                  {teams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="botId">Bot por defecto</Label>
              <Select value={formBotId} onValueChange={setFormBotId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar bot" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sin bot</SelectItem>
                  {bots.map((bot) => (
                    <SelectItem key={bot.id} value={bot.id}>
                      {bot.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={saving || !formPhoneNumber.trim()}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Agregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Numero de WhatsApp</DialogTitle>
            <DialogDescription>
              Modifica la configuracion del numero.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-phoneNumber">Numero de telefono</Label>
              <Input
                id="edit-phoneNumber"
                placeholder="+528120854452"
                value={formPhoneNumber}
                onChange={(e) => setFormPhoneNumber(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-displayName">Nombre para mostrar</Label>
              <Input
                id="edit-displayName"
                placeholder="Ventas WhatsApp"
                value={formDisplayName}
                onChange={(e) => setFormDisplayName(e.target.value)}
              />
            </div>

            {providerFields("edit")}

            <div className="space-y-2">
              <Label htmlFor="edit-teamId">Equipo</Label>
              <Select value={formTeamId} onValueChange={setFormTeamId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar equipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sin equipo</SelectItem>
                  {teams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-botId">Bot por defecto</Label>
              <Select value={formBotId} onValueChange={setFormBotId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar bot" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sin bot</SelectItem>
                  {bots.map((bot) => (
                    <SelectItem key={bot.id} value={bot.id}>
                      {bot.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleEdit} disabled={saving || !formPhoneNumber.trim()}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
