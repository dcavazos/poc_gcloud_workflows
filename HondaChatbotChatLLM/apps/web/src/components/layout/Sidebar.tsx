"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Bot,
  MessageSquare,
  Users,
  Users2,
  Phone,
  Settings,
  LogOut,
  Bell,
  BellOff,
  FileText,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useNotificationContext } from "@/contexts/NotificationContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ModeToggle } from "@/components/mode-toggle";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard, adminOnly: false },
  { name: "Conversaciones", href: "/conversations", icon: MessageSquare, showBadge: true, adminOnly: false },
  { name: "Bots", href: "/bots", icon: Bot, adminOnly: true },
  { name: "WhatsApp", href: "/whatsapp-numbers", icon: Phone, adminOnly: true },
  { name: "Equipos", href: "/teams", icon: Users2, adminOnly: true },
  { name: "Agentes", href: "/team", icon: Users, adminOnly: false },
  { name: "Plantillas", href: "/templates", icon: FileText, adminOnly: true },
  { name: "Configuracion", href: "/settings", icon: Settings, adminOnly: true },
];

// ... imports

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> { }

export function Sidebar({ className }: SidebarProps) {
  const pathname = usePathname();
  const { user, userData, signOut } = useAuth();
  const { unreadCount, permission, supported, requestPermission } = useNotificationContext();


  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const handleEnableNotifications = async () => {
    await requestPermission();
  };

  return (
    <div className={cn("hidden border-r bg-sidebar md:flex md:w-72 md:flex-col glass transition-all duration-300 ease-in-out", className)}>
      {/* Header */}
      <div className="flex h-16 items-center justify-between border-b px-6">
        <div className="flex items-center gap-2">
          {/* Placeholder for a logo icon if desired */}
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <h1 className="text-lg font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            Honda Chatbot
          </h1>
        </div>
        <ModeToggle />
      </div>

      {/* Notification Banner */}
      {supported && permission !== "granted" && (
        <div className="mx-4 mt-4 p-4 rounded-xl border border-destructive/20 bg-destructive/5 dark:bg-destructive/10">
          <div className="flex items-center gap-3 text-sm text-destructive font-medium">
            <BellOff className="h-4 w-4" />
            <span>Notificaciones desactivadas</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="mt-3 w-full text-xs font-semibold border-destructive/20 hover:bg-destructive/10 hover:text-destructive"
            onClick={handleEnableNotifications}
          >
            <Bell className="mr-2 h-3 w-3" />
            Activar ahora
          </Button>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-4 py-6">
        <p className="px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-2">
          General
        </p>
        {navigation.filter((item) => !item.adminOnly || userData?.role === "admin").map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          const showBadge = item.showBadge && unreadCount > 0;

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "group flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ease-in-out",
                isActive
                  ? "bg-primary/10 text-primary shadow-sm"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground hover:translate-x-1"
              )}
            >
              <div className="flex items-center gap-3">
                <item.icon className={cn("h-5 w-5 transition-colors", isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                {item.name}
              </div>
              {showBadge && (
                <Badge className="h-5 min-w-[20px] px-1.5 bg-destructive hover:bg-destructive/90 animate-pulse">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </Badge>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      <div className="border-t bg-muted/20 p-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="w-full justify-start gap-3 h-auto p-2 hover:bg-background rounded-xl transition-all">
              <Avatar className="h-9 w-9 border border-border">
                <AvatarImage src={user?.photoURL || undefined} />
                <AvatarFallback className="bg-primary/10 text-primary font-bold">
                  {userData?.name ? getInitials(userData.name) : "U"}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col items-start text-sm overflow-hidden">
                <span className="font-semibold truncate w-full text-left">{userData?.name || "Usuario"}</span>
                <span className="text-xs text-muted-foreground truncate w-full text-left">{userData?.role || "viewer"}</span>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60 p-2">
            <div className="flex items-center gap-2 p-2 border-b mb-2">
              <div className="bg-primary/10 p-1 rounded-md">
                <Users className="h-4 w-4 text-primary" />
              </div>
              <div className="flex flex-col text-xs">
                <span className="font-semibold">Mi Cuenta</span>
                <span className="text-muted-foreground">Gestionar perfil</span>
              </div>
            </div>
            {supported && permission !== "granted" && (
              <>
                <DropdownMenuItem onClick={handleEnableNotifications} className="cursor-pointer">
                  <Bell className="mr-2 h-4 w-4" />
                  Activar notificaciones
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive cursor-pointer">
              <LogOut className="mr-2 h-4 w-4" />
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
