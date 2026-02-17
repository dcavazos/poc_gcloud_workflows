"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Loader2,
  Send,
  Phone,
  Bot,
  User,
  UserCircle,
  RotateCcw,
  XCircle,
  RefreshCw,
} from "lucide-react";
import { db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  collection,
  query,
  orderBy,
  onSnapshot,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useAuth } from "@/contexts/AuthContext";

interface Conversation {
  id: string;
  customerPhone: string;
  customerName: string | null;
  status: "bot" | "waiting_agent" | "with_agent" | "closed";
  botId: string;
  organizationId: string;
  lastMessageAt: Timestamp;
}

interface Message {
  id: string;
  conversationId: string;
  sender: "customer" | "bot" | "agent";
  agentId: string | null;
  text: string;
  mediaUrl: string | null;
  createdAt: Timestamp;
}

export default function ConversationDetailPage() {
  const params = useParams();
  const { user } = useAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [returningToBot, setReturningToBot] = useState(false);
  const [closing, setClosing] = useState(false);
  const [reopening, setReopening] = useState(false);

  const statusLabels = {
    bot: "Con Bot",
    waiting_agent: "Esperando Agente",
    with_agent: "Con Agente",
    closed: "Cerrada",
  };

  const statusColors = {
    bot: "bg-blue-100 text-blue-800",
    waiting_agent: "bg-yellow-100 text-yellow-800",
    with_agent: "bg-green-100 text-green-800",
    closed: "bg-gray-100 text-gray-800",
  };

  useEffect(() => {
    if (!params.id) return;

    const fetchConversation = async () => {
      const convDoc = await getDoc(doc(db, "conversations", params.id as string));
      if (convDoc.exists()) {
        setConversation({ id: convDoc.id, ...convDoc.data() } as Conversation);
      }
      setLoading(false);
    };

    fetchConversation();

    // Subscribe to messages
    const messagesRef = collection(
      db,
      "conversations",
      params.id as string,
      "messages"
    );
    const q = query(messagesRef, orderBy("createdAt", "asc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs: Message[] = [];
      snapshot.forEach((doc) => {
        msgs.push({ id: doc.id, ...doc.data() } as Message);
      });
      setMessages(msgs);
    });

    return () => unsubscribe();
  }, [params.id]);

  useEffect(() => {
    // Scroll to bottom when messages change
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const formatMessageTime = (timestamp: Timestamp) => {
    if (!timestamp) return "";
    const date = timestamp.toDate();
    return format(date, "HH:mm", { locale: es });
  };

  const formatMessageDate = (timestamp: Timestamp) => {
    if (!timestamp) return "";
    const date = timestamp.toDate();
    return format(date, "d 'de' MMMM, yyyy", { locale: es });
  };

  const getSenderIcon = (sender: string) => {
    switch (sender) {
      case "customer":
        return <User className="h-4 w-4" />;
      case "bot":
        return <Bot className="h-4 w-4" />;
      case "agent":
        return <UserCircle className="h-4 w-4" />;
      default:
        return <User className="h-4 w-4" />;
    }
  };

  const getSenderLabel = (sender: string) => {
    switch (sender) {
      case "customer":
        return "Cliente";
      case "bot":
        return "Bot";
      case "agent":
        return "Agente";
      default:
        return sender;
    }
  };

  // Group messages by date
  const groupedMessages: { date: string; messages: Message[] }[] = [];
  let currentDate = "";

  messages.forEach((msg) => {
    const msgDate = msg.createdAt
      ? formatMessageDate(msg.createdAt)
      : "Sin fecha";

    if (msgDate !== currentDate) {
      currentDate = msgDate;
      groupedMessages.push({ date: msgDate, messages: [msg] });
    } else {
      groupedMessages[groupedMessages.length - 1].messages.push(msg);
    }
  });

  const canSendMessage = conversation?.status === "with_agent";

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !user || !conversation || sending) return;

    setSending(true);
    try {
      const response = await fetch("/api/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: params.id,
          text: newMessage.trim(),
          agentId: user.uid,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      setNewMessage("");
    } catch (error) {
      console.error("Error sending message:", error);
      alert("Error al enviar mensaje");
    } finally {
      setSending(false);
    }
  };

  const handleTakeConversation = async () => {
    if (!user || !conversation) return;

    try {
      await updateDoc(doc(db, "conversations", params.id as string), {
        status: "with_agent",
        assignedAgentId: user.uid,
        assignedAt: new Date(),
      });
    } catch (error) {
      console.error("Error taking conversation:", error);
      alert("Error al tomar conversacion");
    }
  };

  const handleReturnToBot = async () => {
    if (!conversation || returningToBot) return;

    setReturningToBot(true);
    try {
      await updateDoc(doc(db, "conversations", params.id as string), {
        status: "bot",
        assignedAgentId: null,
        assignedAt: null,
      });
    } catch (error) {
      console.error("Error returning to bot:", error);
      alert("Error al devolver a bot");
    } finally {
      setReturningToBot(false);
    }
  };

  const handleCloseConversation = async () => {
    if (!conversation || !user || closing) return;

    setClosing(true);
    try {
      // Send closing message to customer via WhatsApp
      await fetch("/api/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: params.id,
          text: "Esta conversacion ha sido cerrada. Si necesitas ayuda nuevamente, no dudes en escribirnos. ¡Gracias!",
          agentId: user.uid,
        }),
      });

      await updateDoc(doc(db, "conversations", params.id as string), {
        status: "closed",
        assignedAgentId: null,
        assignedAt: null,
        closedAt: new Date(),
      });
      setConversation({ ...conversation, status: "closed" });
    } catch (error) {
      console.error("Error closing conversation:", error);
      alert("Error al cerrar la conversacion");
    } finally {
      setClosing(false);
    }
  };

  const handleReopenConversation = async () => {
    if (!conversation || reopening) return;

    setReopening(true);
    try {
      await updateDoc(doc(db, "conversations", params.id as string), {
        status: "bot",
        assignedAgentId: null,
        assignedAt: null,
        closedAt: null,
      });
      setConversation({ ...conversation, status: "bot" });
    } catch (error) {
      console.error("Error reopening conversation:", error);
      alert("Error al reabrir la conversacion");
    } finally {
      setReopening(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Conversacion no encontrada</p>
        <Link href="/conversations">
          <Button variant="link">Volver a Conversaciones</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-120px)]">
      {/* Header */}
      <div className="flex items-center gap-4 pb-4 border-b">
        <Link href="/conversations">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">
              {conversation.customerName || conversation.customerPhone}
            </h1>
            <Badge
              className={statusColors[conversation.status]}
              variant="secondary"
            >
              {statusLabels[conversation.status]}
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Phone className="h-3 w-3" />
            <span>{conversation.customerPhone}</span>
          </div>
        </div>
        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {conversation.status === "waiting_agent" && (
            <Button onClick={handleTakeConversation}>
              Tomar conversacion
            </Button>
          )}
          {conversation.status === "with_agent" && (
            <>
              <Button
                variant="outline"
                onClick={handleReturnToBot}
                disabled={returningToBot}
              >
                {returningToBot ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="mr-2 h-4 w-4" />
                )}
                Devolver a Bot
              </Button>
              <Button
                variant="outline"
                onClick={handleCloseConversation}
                disabled={closing}
                className="text-red-600 hover:text-red-700"
              >
                {closing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="mr-2 h-4 w-4" />
                )}
                Cerrar
              </Button>
            </>
          )}
          {conversation.status === "closed" && (
            <Button
              variant="outline"
              onClick={handleReopenConversation}
              disabled={reopening}
            >
              {reopening ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Reabrir
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4">
        {groupedMessages.map((group, groupIndex) => (
          <div key={groupIndex}>
            {/* Date separator */}
            <div className="flex items-center justify-center my-4">
              <span className="bg-gray-100 text-gray-500 text-xs px-3 py-1 rounded-full">
                {group.date}
              </span>
            </div>

            {/* Messages for this date */}
            {group.messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${
                  msg.sender === "customer" ? "justify-start" : "justify-end"
                } mb-2`}
              >
                <div
                  className={`max-w-[70%] rounded-lg px-4 py-2 ${
                    msg.sender === "customer"
                      ? "bg-gray-100 text-gray-900"
                      : msg.sender === "bot"
                      ? "bg-blue-500 text-white"
                      : "bg-green-500 text-white"
                  }`}
                >
                  {/* Sender label */}
                  <div
                    className={`flex items-center gap-1 text-xs mb-1 ${
                      msg.sender === "customer"
                        ? "text-gray-500"
                        : "text-white/80"
                    }`}
                  >
                    {getSenderIcon(msg.sender)}
                    <span>{getSenderLabel(msg.sender)}</span>
                  </div>

                  {/* Message text */}
                  <p className="whitespace-pre-wrap break-words">{msg.text}</p>

                  {/* Time */}
                  <div
                    className={`text-xs mt-1 text-right ${
                      msg.sender === "customer"
                        ? "text-gray-400"
                        : "text-white/70"
                    }`}
                  >
                    {formatMessageTime(msg.createdAt)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Message input */}
      <div className="border-t pt-4">
        <Card className="p-2">
          {canSendMessage ? (
            <div className="flex gap-2">
              <Input
                placeholder="Escribe un mensaje..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={sending}
                className="flex-1"
              />
              <Button onClick={handleSendMessage} disabled={sending || !newMessage.trim()}>
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <Input
                  placeholder="Escribe un mensaje..."
                  disabled
                  className="flex-1"
                />
                <Button disabled>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-gray-400 mt-2 text-center">
                {conversation?.status === "waiting_agent"
                  ? "Toma la conversacion para poder enviar mensajes"
                  : conversation?.status === "bot"
                  ? "Esta conversacion esta siendo atendida por el bot"
                  : conversation?.status === "closed"
                  ? "Esta conversacion esta cerrada. Puedes reabrirla para continuar."
                  : "No puedes enviar mensajes en esta conversacion"}
              </p>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
