"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, Save, Eye, EyeOff, RefreshCw, Brain, Wrench, FileText, Search } from "lucide-react";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";

interface BotData {
  id: string;
  name: string;
  description: string;
  status: "active" | "paused" | "draft";
  organizationId: string;
  twilioConfig: {
    phoneNumber: string;
    accountSid: string;
    authToken: string;
  };
  abacusConfig: {
    apiUrl: string;
    deploymentId: string;
    deploymentToken: string;
  };
  handoffConfig: {
    enabled: boolean;
    triggerKeywords: string[];
  };
}

export default function EditBotPage() {
  const params = useParams();
  const router = useRouter();
  const { userData } = useAuth();
  const [bot, setBot] = useState<BotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showTwilioToken, setShowTwilioToken] = useState(false);
  const [showAbacusToken, setShowAbacusToken] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [twilioAccountSid, setTwilioAccountSid] = useState("");
  const [twilioAuthToken, setTwilioAuthToken] = useState("");
  const [abacusApiUrl, setAbacusApiUrl] = useState("");
  const [abacusDeploymentId, setAbacusDeploymentId] = useState("");
  const [abacusDeploymentToken, setAbacusDeploymentToken] = useState("");
  const [handoffEnabled, setHandoffEnabled] = useState(false);
  const [handoffKeywords, setHandoffKeywords] = useState("");

  // ChatLLM config state
  const [chatllmConfig, setChatllmConfig] = useState<Record<string, unknown> | null>(null);
  const [chatllmLoading, setChatllmLoading] = useState(false);
  const [chatllmError, setChatllmError] = useState("");

  useEffect(() => {
    const fetchBot = async () => {
      if (!params.id) return;

      try {
        const botDoc = await getDoc(doc(db, "bots", params.id as string));
        if (botDoc.exists()) {
          const data = { id: botDoc.id, ...botDoc.data() } as BotData;
          setBot(data);

          // Populate form
          setName(data.name || "");
          setDescription(data.description || "");
          setPhoneNumber(data.twilioConfig?.phoneNumber || "");
          setTwilioAccountSid(data.twilioConfig?.accountSid || "");
          setTwilioAuthToken(data.twilioConfig?.authToken || "");
          setAbacusApiUrl(data.abacusConfig?.apiUrl || "");
          setAbacusDeploymentId(data.abacusConfig?.deploymentId || "");
          setAbacusDeploymentToken(data.abacusConfig?.deploymentToken || "");
          setHandoffEnabled(data.handoffConfig?.enabled || false);
          setHandoffKeywords(data.handoffConfig?.triggerKeywords?.join(", ") || "");
        }
      } catch (error) {
        console.error("Error fetching bot:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchBot();
  }, [params.id]);

  const fetchChatLLMConfig = async () => {
    if (!params.id) return;

    setChatllmLoading(true);
    setChatllmError("");
    try {
      const res = await fetch(`/api/abacus-config?botId=${params.id}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        setChatllmError(data.error || "Error al obtener configuracion");
        return;
      }

      setChatllmConfig(data.result);
    } catch (error) {
      console.error("Error fetching ChatLLM config:", error);
      setChatllmError("Error de conexion con Abacus AI");
    } finally {
      setChatllmLoading(false);
    }
  };

  const handleSave = async () => {
    if (!bot) return;

    setSaving(true);
    try {
      await updateDoc(doc(db, "bots", bot.id), {
        name,
        description,
        twilioConfig: {
          phoneNumber,
          accountSid: twilioAccountSid,
          authToken: twilioAuthToken,
        },
        abacusConfig: {
          apiUrl: abacusApiUrl,
          deploymentId: abacusDeploymentId,
          deploymentToken: abacusDeploymentToken,
        },
        handoffConfig: {
          enabled: handoffEnabled,
          triggerKeywords: handoffKeywords
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean),
        },
      });
      router.push("/bots");
    } catch (error) {
      console.error("Error saving bot:", error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!bot) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Bot no encontrado</p>
        <Link href="/bots">
          <Button variant="link">Volver a Bots</Button>
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-8">
        <Link href="/bots">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Editar Bot</h1>
          <p className="text-gray-500">{bot.name}</p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Guardar Cambios
        </Button>
      </div>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="twilio">Twilio</TabsTrigger>
          <TabsTrigger value="abacus">Abacus AI</TabsTrigger>
          <TabsTrigger value="handoff">Handoff</TabsTrigger>
          <TabsTrigger value="chatllm" onClick={() => { if (!chatllmConfig && !chatllmLoading) fetchChatLLMConfig(); }}>
            ChatLLM
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>Informacion General</CardTitle>
              <CardDescription>
                Configura el nombre y descripcion de tu bot
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nombre del Bot</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: Bot de Ventas"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Descripcion</Label>
                <Input
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ej: Bot para atencion de clientes de ventas"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="twilio">
          <Card>
            <CardHeader>
              <CardTitle>Configuracion de Twilio</CardTitle>
              <CardDescription>
                Credenciales de tu cuenta de Twilio para WhatsApp
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="phoneNumber">Numero de WhatsApp</Label>
                <Input
                  id="phoneNumber"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="whatsapp:+528120854452"
                />
                <p className="text-xs text-gray-500">
                  Formato: whatsapp:+[codigo pais][numero]
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="twilioAccountSid">Account SID</Label>
                <Input
                  id="twilioAccountSid"
                  value={twilioAccountSid}
                  onChange={(e) => setTwilioAccountSid(e.target.value)}
                  placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="twilioAuthToken">Auth Token</Label>
                <div className="relative">
                  <Input
                    id="twilioAuthToken"
                    type={showTwilioToken ? "text" : "password"}
                    value={twilioAuthToken}
                    onChange={(e) => setTwilioAuthToken(e.target.value)}
                    placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={() => setShowTwilioToken(!showTwilioToken)}
                  >
                    {showTwilioToken ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="abacus">
          <Card>
            <CardHeader>
              <CardTitle>Configuracion de Abacus AI</CardTitle>
              <CardDescription>
                Credenciales de tu deployment de ChatLLM
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="abacusApiUrl">API URL</Label>
                <Input
                  id="abacusApiUrl"
                  value={abacusApiUrl}
                  onChange={(e) => setAbacusApiUrl(e.target.value)}
                  placeholder="https://xxx.abacus.ai/api/v0/chatLLM"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="abacusDeploymentId">Deployment ID</Label>
                <Input
                  id="abacusDeploymentId"
                  value={abacusDeploymentId}
                  onChange={(e) => setAbacusDeploymentId(e.target.value)}
                  placeholder="xxxxxxxxx"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="abacusDeploymentToken">Deployment Token</Label>
                <div className="relative">
                  <Input
                    id="abacusDeploymentToken"
                    type={showAbacusToken ? "text" : "password"}
                    value={abacusDeploymentToken}
                    onChange={(e) => setAbacusDeploymentToken(e.target.value)}
                    placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={() => setShowAbacusToken(!showAbacusToken)}
                  >
                    {showAbacusToken ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="handoff">
          <Card>
            <CardHeader>
              <CardTitle>Configuracion de Handoff</CardTitle>
              <CardDescription>
                Configura cuando el bot debe transferir a un agente humano
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="handoffEnabled"
                  checked={handoffEnabled}
                  onChange={(e) => setHandoffEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="handoffEnabled">Habilitar handoff a agentes</Label>
              </div>
              {handoffEnabled && (
                <div className="space-y-2">
                  <Label htmlFor="handoffKeywords">
                    Palabras clave para handoff
                  </Label>
                  <Input
                    id="handoffKeywords"
                    value={handoffKeywords}
                    onChange={(e) => setHandoffKeywords(e.target.value)}
                    placeholder="hablar con humano, asesor, agente"
                  />
                  <p className="text-xs text-gray-500">
                    Separadas por comas. Cuando el cliente escriba alguna de estas
                    palabras, se transferira a un agente.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="chatllm">
          {chatllmLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : chatllmError ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-gray-500 mb-4">{chatllmError}</p>
                <Button variant="outline" onClick={fetchChatLLMConfig}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Reintentar
                </Button>
              </CardContent>
            </Card>
          ) : chatllmConfig ? (
            <ChatLLMConfigView config={chatllmConfig} onRefresh={fetchChatLLMConfig} />
          ) : (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-gray-500 mb-4">
                  Carga la configuracion del modelo ChatLLM desde Abacus AI.
                </p>
                <Button onClick={fetchChatLLMConfig}>
                  <Brain className="mr-2 h-4 w-4" />
                  Cargar Configuracion
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ChatLLMConfigView({ config, onRefresh }: { config: Record<string, unknown>; onRefresh: () => void }) {
  const deployment = config.deployment as Record<string, unknown> || {};
  const model = config.model as Record<string, unknown> || {};
  const cfg = config.config as Record<string, unknown> || {};
  const retriever = config.documentRetriever as Record<string, unknown> | null;
  const bestAlgorithm = model.bestAlgorithm as Record<string, string> || {};
  const deployableAlgorithms = model.deployableAlgorithms as Array<Record<string, string>> || [];
  const customTools = cfg.customTools as string[] || [];
  const builtinTools = cfg.builtinTools as string[] || [];
  const documentRetrievers = cfg.documentRetrievers as string[] || [];

  const statusColors: Record<string, string> = {
    ACTIVE: "bg-green-100 text-green-800",
    STOPPED: "bg-red-100 text-red-800",
    PENDING: "bg-yellow-100 text-yellow-800",
    COMPLETE: "bg-green-100 text-green-800",
  };

  return (
    <div className="space-y-4">
      {/* Deployment & Model Info */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              Deployment y Modelo
            </CardTitle>
            <CardDescription>
              Informacion del deployment y modelo LLM en Abacus AI
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="mr-2 h-3 w-3" />
            Actualizar
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-500">Deployment</p>
                <p className="text-sm font-medium">{deployment.name as string}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Status</p>
                <Badge className={statusColors[deployment.status as string] || "bg-gray-100 text-gray-800"}>
                  {deployment.status as string}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-gray-500">Modelo desplegado</p>
                <p className="text-sm font-medium">{deployment.algoName as string}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Region</p>
                <p className="text-sm">{deployment.region as string}</p>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-500">Mejor algoritmo (entrenamiento)</p>
                <p className="text-sm font-medium">{bestAlgorithm.name}</p>
                <p className="text-xs text-gray-400">{bestAlgorithm.llmName}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Entrenamiento</p>
                <Badge className={statusColors[model.trainingStatus as string] || "bg-gray-100 text-gray-800"}>
                  {model.trainingStatus as string}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-gray-500">Modelos disponibles</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {deployableAlgorithms.map((algo) => (
                    <Badge key={algo.llmName} variant="outline" className="text-xs">
                      {algo.name}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500">Auto-deploy</p>
                <p className="text-sm">{deployment.autoDeploy ? "Activado" : "Desactivado"}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tools */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Tools
          </CardTitle>
          <CardDescription>
            Herramientas configuradas en el modelo
          </CardDescription>
        </CardHeader>
        <CardContent>
          {customTools.length === 0 && builtinTools.length === 0 ? (
            <p className="text-sm text-gray-500">No hay tools configurados</p>
          ) : (
            <div className="space-y-2">
              {customTools.map((tool) => (
                <div key={tool} className="flex items-center gap-2 p-2 rounded border">
                  <Badge variant="secondary" className="text-xs">Custom</Badge>
                  <span className="text-sm font-mono">{tool}</span>
                </div>
              ))}
              {builtinTools.map((tool) => (
                <div key={tool} className="flex items-center gap-2 p-2 rounded border">
                  <Badge variant="outline" className="text-xs">Builtin</Badge>
                  <span className="text-sm font-mono">{tool}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Document Retriever */}
      {retriever && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Document Retriever
            </CardTitle>
            <CardDescription>
              Configuracion de busqueda de documentos
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-gray-500">Nombre</p>
                  <p className="text-sm font-medium">{retriever.name as string}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Feature Group</p>
                  <p className="text-sm">{retriever.featureGroupName as string}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Chunks</p>
                  <p className="text-sm">{retriever.numberOfChunks as number} chunks indexados</p>
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-gray-500">Chunk Size</p>
                  <p className="text-sm">{retriever.chunkSize as number} tokens</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Overlap</p>
                  <p className="text-sm">{((retriever.chunkOverlapFraction as number) * 100)}%</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Encoder</p>
                  <p className="text-sm">{retriever.textEncoder as string}</p>
                </div>
              </div>
            </div>
            {documentRetrievers.length > 0 && (
              <div className="mt-3 pt-3 border-t">
                <p className="text-xs text-gray-500 mb-1">Retrievers activos</p>
                <div className="flex flex-wrap gap-1">
                  {documentRetrievers.map((r) => (
                    <Badge key={r} variant="outline" className="text-xs">{r}</Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Behavior Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Instrucciones de Comportamiento
          </CardTitle>
          <CardDescription>
            System prompt principal del modelo
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="whitespace-pre-wrap text-sm bg-gray-50 p-4 rounded-lg border max-h-96 overflow-y-auto font-mono leading-relaxed">
            {cfg.behaviorInstructions as string || "Sin instrucciones configuradas"}
          </pre>
        </CardContent>
      </Card>

      {/* Response Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Instrucciones de Respuesta</CardTitle>
          <CardDescription>
            Como debe formatear las respuestas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="whitespace-pre-wrap text-sm bg-gray-50 p-4 rounded-lg border max-h-64 overflow-y-auto font-mono leading-relaxed">
            {cfg.responseInstructions as string || "Sin instrucciones configuradas"}
          </pre>
        </CardContent>
      </Card>

      {/* Unknown Answer Phrase */}
      <Card>
        <CardHeader>
          <CardTitle>Frase de Respuesta Desconocida</CardTitle>
          <CardDescription>
            Respuesta cuando el modelo no encuentra informacion relevante
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-gray-50 p-4 rounded-lg border">
            <p className="text-sm italic">
              {cfg.unknownAnswerPhrase as string || "Sin frase configurada"}
            </p>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-gray-500">Conocimiento general:</span>
            <Badge variant={cfg.includeGeneralKnowledge ? "default" : "secondary"}>
              {cfg.includeGeneralKnowledge ? "Activado" : "Desactivado"}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
