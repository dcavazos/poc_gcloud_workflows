"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, Bot, Users, Clock, ArrowUpRight, Sparkles, Activity } from "lucide-react";
import { motion } from "framer-motion";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";

export default function DashboardPage() {
  const { userData } = useAuth();
  const [activeConversations, setActiveConversations] = useState(0);
  const [activeBots, setActiveBots] = useState(0);
  const [onlineAgents, setOnlineAgents] = useState(0);

  useEffect(() => {
    if (!userData?.organizationId) return;
    const orgId = userData.organizationId;

    // Active conversations (waiting_agent + with_agent)
    const convsQ = query(
      collection(db, "conversations"),
      where("organizationId", "==", orgId),
      where("status", "in", ["waiting_agent", "with_agent"])
    );
    const unsubConvs = onSnapshot(convsQ, (snap) => setActiveConversations(snap.size));

    // Active bots
    const botsQ = query(
      collection(db, "bots"),
      where("organizationId", "==", orgId),
      where("status", "==", "active")
    );
    const unsubBots = onSnapshot(botsQ, (snap) => setActiveBots(snap.size));

    // Online agents
    const usersQ = query(
      collection(db, "users"),
      where("organizationId", "==", orgId),
      where("status", "==", "online")
    );
    const unsubUsers = onSnapshot(usersQ, (snap) => setOnlineAgents(snap.size));

    return () => {
      unsubConvs();
      unsubBots();
      unsubUsers();
    };
  }, [userData?.organizationId]);

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const item = {
    hidden: { y: 20, opacity: 0 },
    show: { y: 0, opacity: 1 }
  };

  const stats = [
    {
      title: "Conversaciones Activas",
      value: String(activeConversations),
      icon: MessageSquare,
      description: "En curso ahora",
      color: "text-blue-500",
      bg: "bg-blue-500/10",
      trend: "Tiempo real"
    },
    {
      title: "Bots Activos",
      value: String(activeBots),
      icon: Bot,
      description: "Respondiendo mensajes",
      color: "text-purple-500",
      bg: "bg-purple-500/10",
      trend: "Tiempo real"
    },
    {
      title: "Agentes Online",
      value: String(onlineAgents),
      icon: Users,
      description: "Disponibles",
      color: "text-green-500",
      bg: "bg-green-500/10",
      trend: "Tiempo real"
    },
    {
      title: "Tiempo de Respuesta",
      value: "—",
      icon: Clock,
      description: "Promedio global",
      color: "text-orange-500",
      bg: "bg-orange-500/10",
      trend: "Proximamente"
    },
  ];

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-8"
    >
      <motion.div variants={item} className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Hola, <span className="text-gradient">{userData?.name?.split(" ")[0] || "Usuario"}</span>
            <span className="inline-block animate-wave ml-2">👋</span>
          </h1>
          <p className="text-muted-foreground mt-1 text-lg">
            Aquí tienes un resumen de la actividad de hoy.
          </p>
        </div>
        <div className="flex gap-2">
          <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-primary text-primary-foreground hover:bg-primary/80">
            <Activity className="w-3 h-3 mr-1" />
            Sistema Operativo
          </span>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <motion.div variants={item} key={stat.title}>
            <Card className="glass-card overflow-hidden relative group border-0 shadow-lg dark:shadow-none bg-card/40 hover:bg-card/60 transition-all duration-300">
              <div className={`absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity ${stat.color}`}>
                <stat.icon className="w-24 h-24 -mr-4 -mt-4 transform rotate-12" />
              </div>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 z-10 relative">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <div className={`p-2 rounded-full ${stat.bg}`}>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent className="z-10 relative">
                <div className="text-3xl font-bold">{stat.value}</div>
                <div className="flex items-center text-xs text-muted-foreground mt-1">
                  <span className={stat.trend.includes("+") || stat.trend.includes("mejora") ? "text-emerald-500 font-medium flex items-center" : "text-muted-foreground flex items-center"}>
                    {stat.trend.includes("+") && <ArrowUpRight className="w-3 h-3 mr-1" />}
                    {stat.trend}
                  </span>
                  <span className="mx-1">•</span>
                  <span>{stat.description}</span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Quick Actions */}
      <motion.div variants={item} className="mt-8">
        <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-yellow-500" />
          Acciones Rápidas
        </h2>
        <div className="grid gap-6 md:grid-cols-3">
          <Card className="glass-card cursor-pointer group border-l-4 border-l-blue-500 hover:-translate-y-1 transition-all duration-300">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="rounded-xl bg-blue-500/10 p-4 group-hover:bg-blue-500/20 transition-colors">
                  <Bot className="h-8 w-8 text-blue-500" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg group-hover:text-blue-500 transition-colors">Crear Bot</h3>
                  <p className="text-sm text-muted-foreground">
                    Conecta un nuevo chatbot inteligente
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card cursor-pointer group border-l-4 border-l-green-500 hover:-translate-y-1 transition-all duration-300">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="rounded-xl bg-green-500/10 p-4 group-hover:bg-green-500/20 transition-colors">
                  <MessageSquare className="h-8 w-8 text-green-500" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg group-hover:text-green-500 transition-colors">Chats Activos</h3>
                  <p className="text-sm text-muted-foreground">
                    Supervisa conversaciones en tiempo real
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card cursor-pointer group border-l-4 border-l-purple-500 hover:-translate-y-1 transition-all duration-300">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="rounded-xl bg-purple-500/10 p-4 group-hover:bg-purple-500/20 transition-colors">
                  <Users className="h-8 w-8 text-purple-500" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg group-hover:text-purple-500 transition-colors">Invitar Agente</h3>
                  <p className="text-sm text-muted-foreground">
                    Expande tu equipo de atención
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </motion.div>

      {/* No organization warning */}
      {!userData?.organizationId && (
        <motion.div variants={item} className="mt-8 rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-6 backdrop-blur-sm">
          <h3 className="font-medium text-yellow-600 dark:text-yellow-400 flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Configuración Pendiente
          </h3>
          <p className="text-sm text-muted-foreground mt-2">
            Para empezar a usar todas las funciones potentes de la plataforma, necesitas configurar tu organización.
            Ve a <span className="font-semibold text-foreground">Configuración</span> para comenzar.
          </p>
        </motion.div>
      )}
    </motion.div>
  );
}
