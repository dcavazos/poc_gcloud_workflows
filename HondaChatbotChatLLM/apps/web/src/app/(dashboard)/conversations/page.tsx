"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageSquare, Loader2, Bell, BellOff } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  Timestamp,
} from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { useNotifications } from "@/hooks/useNotifications";

interface Conversation {
  id: string;
  customerPhone: string;
  customerName: string | null;
  status: "bot" | "waiting_agent" | "with_agent" | "closed";
  lastMessageAt: Timestamp;
  botId: string;
  organizationId: string;
}

export default function ConversationsPage() {
  const { userData, user } = useAuth();
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const { permission, requestPermission, showNotification, playSound } = useNotifications();
  const prevWaitingCountRef = useRef<number>(0);
  const isInitialLoadRef = useRef<boolean>(true);

  useEffect(() => {
    if (!userData?.organizationId) {
      setLoading(false);
      return;
    }

    const conversationsRef = collection(db, "conversations");
    const q = query(
      conversationsRef,
      where("organizationId", "==", userData.organizationId),
      orderBy("lastMessageAt", "desc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const convs: Conversation[] = [];
        snapshot.forEach((doc) => {
          convs.push({ id: doc.id, ...doc.data() } as Conversation);
        });
        setConversations(convs);
        setLoading(false);

        // Check for new waiting conversations (after initial load)
        if (!isInitialLoadRef.current) {
          const newWaitingCount = convs.filter(c => c.status === "waiting_agent").length;
          if (newWaitingCount > prevWaitingCountRef.current) {
            playSound();
            showNotification("Nueva conversacion esperando", {
              body: "Un cliente solicita hablar con un agente",
            });
          }
          prevWaitingCountRef.current = newWaitingCount;
        } else {
          prevWaitingCountRef.current = convs.filter(c => c.status === "waiting_agent").length;
          isInitialLoadRef.current = false;
        }
      },
      (error) => {
        console.error("Error fetching conversations:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userData?.organizationId, playSound, showNotification]);

  const statusLabels = {
    bot: "Con Bot",
    waiting_agent: "Esperando",
    with_agent: "Con Agente",
    closed: "Cerrada",
  };

  const statusColors = {
    bot: "bg-blue-100 text-blue-800",
    waiting_agent: "bg-yellow-100 text-yellow-800",
    with_agent: "bg-green-100 text-green-800",
    closed: "bg-gray-100 text-gray-800",
  };

  // Filter conversations based on active tab
  const filteredConversations = conversations.filter((conv) => {
    if (activeTab === "all") return conv.status !== "closed";
    if (activeTab === "waiting") return conv.status === "waiting_agent";
    if (activeTab === "active") return conv.status === "with_agent";
    if (activeTab === "bot") return conv.status === "bot";
    if (activeTab === "closed") return conv.status === "closed";
    return true;
  });

  // Count for badges
  const waitingCount = conversations.filter(
    (c) => c.status === "waiting_agent"
  ).length;
  const activeCount = conversations.filter(
    (c) => c.status === "with_agent"
  ).length;
  const botCount = conversations.filter((c) => c.status === "bot").length;
  const closedCount = conversations.filter((c) => c.status === "closed").length;

  const formatTime = (timestamp: Timestamp) => {
    if (!timestamp) return "";
    const date = timestamp.toDate();
    return formatDistanceToNow(date, { addSuffix: true, locale: es });
  };

  const ConversationList = ({ convs }: { convs: Conversation[] }) => {
    if (convs.length === 0) {
      return (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-gray-100 p-4 mb-4">
              <MessageSquare className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium mb-2">No hay conversaciones</h3>
            <p className="text-gray-500 text-center">
              Las conversaciones aparecerán aquí cuando los clientes envíen
              mensajes a tus bots.
            </p>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="space-y-2">
        {convs.map((conv) => (
          <Card
            key={conv.id}
            className="cursor-pointer hover:bg-gray-50 transition-colors"
            onClick={() => router.push(`/conversations/${conv.id}`)}
          >
            <CardContent className="flex items-center justify-between py-4">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                  <span className="text-sm font-medium">
                    {conv.customerName?.[0] || conv.customerPhone?.slice(-2) || "?"}
                  </span>
                </div>
                <div>
                  <p className="font-medium">
                    {conv.customerName || conv.customerPhone}
                  </p>
                  <p className="text-sm text-gray-500">{conv.customerPhone}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span
                  className={`px-2 py-1 rounded-full text-xs font-medium ${
                    statusColors[conv.status]
                  }`}
                >
                  {statusLabels[conv.status]}
                </span>
                <span className="text-sm text-gray-500">
                  {formatTime(conv.lastMessageAt)}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  if (!userData?.organizationId) {
    return (
      <div>
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Conversaciones</h1>
          <p className="text-gray-500">
            Gestiona las conversaciones de WhatsApp
          </p>
        </div>
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-gray-500">
              Necesitas pertenecer a una organización para ver conversaciones.
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
          <h1 className="text-2xl font-bold">Conversaciones</h1>
          <p className="text-gray-500">
            Gestiona las conversaciones de WhatsApp
          </p>
        </div>
        <Button
          variant={permission === "granted" ? "default" : "outline"}
          onClick={requestPermission}
          title={permission === "granted" ? "Notificaciones activas" : "Activar notificaciones"}
        >
          {permission === "granted" ? (
            <Bell className="h-4 w-4" />
          ) : (
            <BellOff className="h-4 w-4" />
          )}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="all">
            Todas
            <Badge variant="secondary" className="ml-2">
              {conversations.length - closedCount}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="waiting">
            Esperando
            {waitingCount > 0 && (
              <Badge variant="destructive" className="ml-2">
                {waitingCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="active">
            Con Agente
            {activeCount > 0 && (
              <Badge variant="secondary" className="ml-2">
                {activeCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="bot">
            Con Bot
            {botCount > 0 && (
              <Badge variant="secondary" className="ml-2">
                {botCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="closed">
            Cerradas
            {closedCount > 0 && (
              <Badge variant="secondary" className="ml-2">
                {closedCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4">
          <ConversationList convs={filteredConversations} />
        </TabsContent>

        <TabsContent value="waiting" className="mt-4">
          <ConversationList convs={filteredConversations} />
        </TabsContent>

        <TabsContent value="active" className="mt-4">
          <ConversationList convs={filteredConversations} />
        </TabsContent>

        <TabsContent value="bot" className="mt-4">
          <ConversationList convs={filteredConversations} />
        </TabsContent>

        <TabsContent value="closed" className="mt-4">
          <ConversationList convs={filteredConversations} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
