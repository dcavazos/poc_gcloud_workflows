"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  UserPlus,
  FileText,
  StickyNote,
  ArrowRightLeft,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { db } from "@/lib/firebase";
import {
  doc,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  updateDoc,
  addDoc,
  serverTimestamp,
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
  assignedAgentId: string | null;
  lastMessageAt: Timestamp;
}

interface Agent {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface Template {
  id: string;
  name: string;
  content: string;
  category: string;
}

interface Note {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: Timestamp;
}

interface Team {
  id: string;
  name: string;
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
  const { user, userData } = useAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [returningToBot, setReturningToBot] = useState(false);
  const [closing, setClosing] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [assigning, setAssigning] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateSheetOpen, setTemplateSheetOpen] = useState(false);
  const [activeView, setActiveView] = useState<"messages" | "notes">("messages");
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [transferring, setTransferring] = useState(false);

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

    // Subscribe to conversation (real-time)
    const convUnsub = onSnapshot(
      doc(db, "conversations", params.id as string),
      (convDoc) => {
        if (convDoc.exists()) {
          setConversation({ id: convDoc.id, ...convDoc.data() } as Conversation);
        }
        setLoading(false);
      }
    );

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

    return () => {
      convUnsub();
      unsubscribe();
    };
  }, [params.id]);

  // Fetch agents for assignment selector
  useEffect(() => {
    if (!conversation?.organizationId) return;

    const usersRef = collection(db, "users");
    const q = query(
      usersRef,
      where("organizationId", "==", conversation.organizationId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const agentList: Agent[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.role === "admin" || data.role === "agent") {
          agentList.push({
            id: doc.id,
            name: data.name || data.email,
            email: data.email,
            role: data.role,
          });
        }
      });
      setAgents(agentList);
    });

    return () => unsubscribe();
  }, [conversation?.organizationId]);

  // Fetch templates
  useEffect(() => {
    if (!conversation?.organizationId) return;

    const q = query(
      collection(db, "templates"),
      where("organizationId", "==", conversation.organizationId)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tmps: Template[] = [];
      snapshot.forEach((d) => tmps.push({ id: d.id, ...d.data() } as Template));
      setTemplates(tmps);
    });
    return () => unsubscribe();
  }, [conversation?.organizationId]);

  // Fetch notes
  useEffect(() => {
    if (!params.id) return;

    const notesRef = collection(db, "conversations", params.id as string, "notes");
    const q = query(notesRef, orderBy("createdAt", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const n: Note[] = [];
      snapshot.forEach((d) => n.push({ id: d.id, ...d.data() } as Note));
      setNotes(n);
    });
    return () => unsubscribe();
  }, [params.id]);

  // Fetch teams for transfer
  useEffect(() => {
    if (!conversation?.organizationId) return;

    const q = query(
      collection(db, "teams"),
      where("organizationId", "==", conversation.organizationId)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const t: Team[] = [];
      snapshot.forEach((d) => t.push({ id: d.id, ...d.data() } as Team));
      setTeams(t);
    });
    return () => unsubscribe();
  }, [conversation?.organizationId]);

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
      const token = await user.getIdToken();
      const response = await fetch("/api/send-message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
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

  const handleAssignAgent = async (agentId: string) => {
    if (!conversation || assigning) return;

    setAssigning(true);
    try {
      await updateDoc(doc(db, "conversations", params.id as string), {
        status: "with_agent",
        assignedAgentId: agentId,
        assignedAt: new Date(),
      });
    } catch (error) {
      console.error("Error assigning agent:", error);
      alert("Error al asignar agente");
    } finally {
      setAssigning(false);
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
      const closeToken = await user.getIdToken();
      await fetch("/api/send-message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${closeToken}`,
        },
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
    } catch (error) {
      console.error("Error reopening conversation:", error);
      alert("Error al reabrir la conversacion");
    } finally {
      setReopening(false);
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim() || !user || addingNote) return;

    setAddingNote(true);
    try {
      const notesRef = collection(db, "conversations", params.id as string, "notes");
      await addDoc(notesRef, {
        authorId: user.uid,
        authorName: userData?.name || user.email || "Agente",
        text: newNote.trim(),
        createdAt: serverTimestamp(),
      });
      setNewNote("");
    } catch (error) {
      console.error("Error adding note:", error);
    } finally {
      setAddingNote(false);
    }
  };

  const handleTransferTeam = async (teamId: string) => {
    if (!conversation || transferring) return;

    setTransferring(true);
    try {
      await updateDoc(doc(db, "conversations", params.id as string), {
        teamId,
        status: "waiting_agent",
        assignedAgentId: null,
        assignedAt: null,
      });
    } catch (error) {
      console.error("Error transferring team:", error);
      alert("Error al transferir equipo");
    } finally {
      setTransferring(false);
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
          {/* Agent selector - visible when waiting or with_agent */}
          {(conversation.status === "waiting_agent" ||
            conversation.status === "with_agent") &&
            agents.length > 0 && (
              <div className="flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-gray-500" />
                <Select
                  value={conversation.assignedAgentId || ""}
                  onValueChange={handleAssignAgent}
                  disabled={assigning}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Asignar agente..." />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          {/* Team transfer */}
          {conversation.status !== "closed" && teams.length > 0 && (
            <Select
              value=""
              onValueChange={handleTransferTeam}
              disabled={transferring}
            >
              <SelectTrigger className="w-[180px]">
                <div className="flex items-center gap-2">
                  <ArrowRightLeft className="h-3 w-3" />
                  <span>Transferir equipo</span>
                </div>
              </SelectTrigger>
              <SelectContent>
                {teams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
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

      {/* View tabs: Messages | Notes */}
      <div className="flex gap-2 py-2 border-b">
        <Button
          variant={activeView === "messages" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveView("messages")}
        >
          Mensajes
        </Button>
        <Button
          variant={activeView === "notes" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveView("notes")}
        >
          <StickyNote className="mr-1 h-3 w-3" />
          Notas {notes.length > 0 && `(${notes.length})`}
        </Button>
      </div>

      {activeView === "messages" ? (
        <>
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
                  {/* Templates button */}
                  <Sheet open={templateSheetOpen} onOpenChange={setTemplateSheetOpen}>
                    <SheetTrigger asChild>
                      <Button variant="outline" size="icon" title="Plantillas">
                        <FileText className="h-4 w-4" />
                      </Button>
                    </SheetTrigger>
                    <SheetContent>
                      <SheetHeader>
                        <SheetTitle>Plantillas</SheetTitle>
                      </SheetHeader>
                      <div className="space-y-2 mt-4 overflow-y-auto max-h-[calc(100vh-120px)]">
                        {templates.length === 0 ? (
                          <p className="text-sm text-gray-500 text-center py-4">
                            Sin plantillas disponibles
                          </p>
                        ) : (
                          templates.map((tpl) => (
                            <Card
                              key={tpl.id}
                              className="cursor-pointer hover:bg-gray-50 transition-colors"
                              onClick={() => {
                                setNewMessage(tpl.content);
                                setTemplateSheetOpen(false);
                              }}
                            >
                              <CardContent className="py-3 px-4">
                                <p className="text-sm font-medium">{tpl.name}</p>
                                <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                                  {tpl.content}
                                </p>
                              </CardContent>
                            </Card>
                          ))
                        )}
                      </div>
                    </SheetContent>
                  </Sheet>
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
        </>
      ) : (
        <>
          {/* Notes view */}
          <div className="flex-1 overflow-y-auto py-4 space-y-3">
            {notes.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">
                Sin notas internas. Agrega una nota visible solo para tu equipo.
              </p>
            ) : (
              notes.map((note) => (
                <div key={note.id} className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-yellow-800">
                      {note.authorName}
                    </span>
                    <span className="text-xs text-yellow-600">
                      {note.createdAt ? formatMessageTime(note.createdAt) : ""}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{note.text}</p>
                </div>
              ))
            )}
          </div>

          {/* Note input */}
          <div className="border-t pt-4">
            <Card className="p-2">
              <div className="flex gap-2">
                <Input
                  placeholder="Agregar nota interna..."
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleAddNote();
                    }
                  }}
                  disabled={addingNote}
                  className="flex-1"
                />
                <Button onClick={handleAddNote} disabled={addingNote || !newNote.trim()}>
                  {addingNote ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <StickyNote className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
