// Organization
export interface Organization {
  id: string;
  name: string;
  createdAt: Date;
  plan: "free" | "pro" | "enterprise";
  settings: {
    timezone: string;
    businessHours: {
      start: string;
      end: string;
    };
  };
  salesforceConfig?: {
    instanceUrl: string;
    username: string;
    password: string;
  };
}

// User
export interface User {
  id: string;
  email: string;
  name: string;
  photoURL: string | null;
  role: "admin" | "agent" | "viewer";
  organizationId: string | null;
  status: "online" | "away" | "offline";
  assignedConversations?: string[];
  createdAt: Date;
  lastLoginAt: Date | null;
  invitedBy?: string;
}

// Bot
export interface Bot {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  abacusConfig: {
    apiUrl: string;
    deploymentId: string;
    deploymentToken: string;
  };
  twilioConfig: {
    phoneNumber: string;
    accountSid: string;
    authToken: string;
  };
  handoffConfig: {
    enabled: boolean;
    triggerKeywords: string[];
    autoHandoffAfterErrors: number;
    workingHoursOnly: boolean;
  };
  status: "active" | "paused" | "draft";
  createdAt: Date;
}

// Conversation
export interface Conversation {
  id: string;
  botId: string;
  organizationId: string;
  customerPhone: string;
  customerName: string | null;
  status: "bot" | "waiting_agent" | "with_agent" | "closed";
  assignedAgentId: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  tags: string[];
  lastMessageAt: Date;
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

// Message
export interface Message {
  id: string;
  conversationId: string;
  sender: "customer" | "bot" | "agent";
  agentId: string | null;
  text: string;
  mediaUrl: string | null;
  createdAt: Date;
}

// Customer
export interface Customer {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  organizationId: string;
  totalConversations: number;
  lastConversationAt: Date;
  tags: string[];
  notes: string | null;
  createdAt: Date;
}

// Stats
export interface DailyStats {
  id: string;
  organizationId: string;
  date: string;
  conversations: {
    total: number;
    byStatus: Record<string, number>;
    byBot: Record<string, number>;
  };
  messages: {
    total: number;
    fromCustomers: number;
    fromBot: number;
    fromAgents: number;
  };
  handoffs: {
    total: number;
    avgResponseTime: number;
  };
  agents: Record<string, { conversations: number; messages: number }>;
}
