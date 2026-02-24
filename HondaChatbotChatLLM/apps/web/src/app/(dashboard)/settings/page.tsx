"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getAuth } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

export default function SettingsPage() {
  const { userData } = useAuth();

  // Salesforce config state
  const [sfInstanceUrl, setSfInstanceUrl] = useState("");
  const [sfClientId, setSfClientId] = useState("");
  const [sfClientSecret, setSfClientSecret] = useState("");
  const [sfUsername, setSfUsername] = useState("");
  const [sfPassword, setSfPassword] = useState("");
  const [showSfClientId, setShowSfClientId] = useState(false);
  const [showSfClientSecret, setShowSfClientSecret] = useState(false);
  const [showSfPassword, setShowSfPassword] = useState(false);
  const [sfSaving, setSfSaving] = useState(false);
  const [sfTesting, setSfTesting] = useState(false);
  const [sfTestResult, setSfTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [sfLoaded, setSfLoaded] = useState(false);

  const isAdmin = userData?.role === "admin";

  // Load Salesforce config from organization doc
  useEffect(() => {
    if (!userData?.organizationId || !isAdmin) return;

    const loadConfig = async () => {
      const orgRef = doc(db, "organizations", userData.organizationId!);
      const orgSnap = await getDoc(orgRef);
      if (orgSnap.exists()) {
        const data = orgSnap.data();
        const sfConfig = data.salesforceConfig;
        if (sfConfig) {
          setSfInstanceUrl(sfConfig.instanceUrl || "");
          setSfClientId(sfConfig.clientId || "");
          setSfClientSecret(sfConfig.clientSecret || "");
          setSfUsername(sfConfig.username || "");
          setSfPassword(sfConfig.password || "");
        }
      }
      setSfLoaded(true);
    };

    loadConfig();
  }, [userData?.organizationId, isAdmin]);

  const handleTestSalesforce = async () => {
    setSfTesting(true);
    setSfTestResult(null);
    try {
      const token = await getAuth().currentUser?.getIdToken();
      const res = await fetch("/api/test-salesforce", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          instanceUrl: sfInstanceUrl.trim(),
          clientId: sfClientId.trim(),
          clientSecret: sfClientSecret.trim(),
          username: sfUsername.trim(),
          password: sfPassword.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSfTestResult({ ok: true, message: "Conexion exitosa" });
      } else {
        setSfTestResult({ ok: false, message: data.error || "Error desconocido" });
      }
    } catch {
      setSfTestResult({ ok: false, message: "Error de red" });
    } finally {
      setSfTesting(false);
    }
  };

  const handleSaveSalesforce = async () => {
    if (!userData?.organizationId) return;

    setSfSaving(true);
    try {
      const orgRef = doc(db, "organizations", userData.organizationId);
      await setDoc(orgRef, {
        salesforceConfig: {
          instanceUrl: sfInstanceUrl.trim(),
          clientId: sfClientId.trim(),
          clientSecret: sfClientSecret.trim(),
          username: sfUsername.trim(),
          password: sfPassword.trim(),
        },
      }, { merge: true });
      alert("Configuracion de Salesforce guardada");
    } catch (error) {
      console.error("Error saving Salesforce config:", error);
      alert("Error al guardar la configuracion de Salesforce");
    } finally {
      setSfSaving(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Configuracion</h1>
        <p className="text-gray-500">Gestiona la configuracion de tu cuenta</p>
      </div>

      {/* Organization Settings */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Organizacion</CardTitle>
          <CardDescription>
            Configura los datos de tu organizacion
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {userData?.organizationId ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="orgName">Nombre de la organizacion</Label>
                <Input id="orgName" placeholder="Mi Empresa" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="timezone">Zona horaria</Label>
                <Input id="timezone" value="America/Monterrey" readOnly />
              </div>
            </>
          ) : (
            <div className="text-center py-4">
              <p className="text-gray-500 mb-4">
                No tienes una organizacion. Crea una para empezar.
              </p>
              <Button>Crear Organizacion</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Salesforce Settings - Admin only */}
      {isAdmin && userData?.organizationId && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Salesforce</CardTitle>
            <CardDescription>
              Credenciales de Salesforce Connected App para envio de WhatsApp via ValueText.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!sfLoaded ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="sfInstanceUrl">Instance URL</Label>
                  <Input
                    id="sfInstanceUrl"
                    type="text"
                    placeholder="https://mycompany.my.salesforce.com"
                    value={sfInstanceUrl}
                    onChange={(e) => setSfInstanceUrl(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sfClientId">Client ID</Label>
                  <div className="relative">
                    <Input
                      id="sfClientId"
                      type={showSfClientId ? "text" : "password"}
                      placeholder="Consumer Key de la Connected App"
                      value={sfClientId}
                      onChange={(e) => setSfClientId(e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                      onClick={() => setShowSfClientId(!showSfClientId)}
                    >
                      {showSfClientId ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sfClientSecret">Client Secret</Label>
                  <div className="relative">
                    <Input
                      id="sfClientSecret"
                      type={showSfClientSecret ? "text" : "password"}
                      placeholder="Consumer Secret de la Connected App"
                      value={sfClientSecret}
                      onChange={(e) => setSfClientSecret(e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                      onClick={() => setShowSfClientSecret(!showSfClientSecret)}
                    >
                      {showSfClientSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sfUsername">Username</Label>
                  <Input
                    id="sfUsername"
                    type="text"
                    placeholder="usuario@empresa.com"
                    value={sfUsername}
                    onChange={(e) => setSfUsername(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sfPassword">Password + Security Token</Label>
                  <div className="relative">
                    <Input
                      id="sfPassword"
                      type={showSfPassword ? "text" : "password"}
                      placeholder="contraseña + security token"
                      value={sfPassword}
                      onChange={(e) => setSfPassword(e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                      onClick={() => setShowSfPassword(!showSfPassword)}
                    >
                      {showSfPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleSaveSalesforce} disabled={sfSaving}>
                    {sfSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Guardar
                  </Button>
                  <Button variant="outline" onClick={handleTestSalesforce} disabled={sfTesting}>
                    {sfTesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Probar Conexion
                  </Button>
                </div>
                {sfTestResult && (
                  <p className={`text-sm ${sfTestResult.ok ? "text-green-600" : "text-red-600"}`}>
                    {sfTestResult.message}
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Profile Settings */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Perfil</CardTitle>
          <CardDescription>Tu informacion personal</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" value={userData?.name || ""} readOnly />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={userData?.email || ""} readOnly />
          </div>
          <div className="space-y-2">
            <Label>Rol</Label>
            <p className="text-sm text-gray-500 capitalize">{userData?.role}</p>
          </div>
        </CardContent>
      </Card>

      <Separator className="my-6" />

      {/* Danger Zone */}
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="text-red-600">Zona de Peligro</CardTitle>
          <CardDescription>
            Acciones irreversibles para tu cuenta
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" disabled>
            Eliminar Cuenta
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
