/** Row types mirroring supabase/migrations/0001_jarvis_init.sql. */

export interface JarvisSettings {
  user_id: string;
  user_name: string;
  address_as: string;
  formality: "tu" | "vous";
  humor: number;
  sarcasm: number;
  verbosity: "concise" | "adaptive" | "detailed";
  proactivity: number;
  emotional_adaptation: boolean;
  relationship_notes: string;
  voice_enabled: boolean;
  voice_name: string;
  voice_rate: number;
}

export interface Conversation {
  id: string;
  user_id: string;
  title: string;
  summary: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  status: "complete" | "interrupted" | "error";
  tone: string | null;
  provider: string | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: string;
}

export type MemoryCategory = "personal" | "preference" | "project" | "relationship" | "important" | "other";
export type MemoryStatus = "confirmed" | "suggested" | "outdated";

export interface Memory {
  id: string;
  user_id: string;
  content: string;
  category: MemoryCategory;
  status: MemoryStatus;
  source: "user" | "assistant";
  importance: number;
  last_confirmed_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UsageEvent {
  id: number;
  user_id: string;
  kind: string;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
  tokens_estimated: boolean;
  created_at: string;
}

export interface ActionLogEntry {
  id: number;
  user_id: string;
  action: string;
  status: "success" | "failure" | "pending" | "blocked";
  detail: Record<string, unknown>;
  created_at: string;
}

export const MEMORY_CATEGORY_LABELS: Record<MemoryCategory, string> = {
  personal: "Personnel",
  preference: "Préférence",
  project: "Projet",
  relationship: "Relationnel",
  important: "Important",
  other: "Autre",
};

export const MEMORY_STATUS_LABELS: Record<MemoryStatus, string> = {
  confirmed: "Confirmé",
  suggested: "Hypothèse",
  outdated: "Obsolète",
};

/** Events streamed by POST /api/chat, one JSON object per line. */
export type ChatStreamEvent =
  | { type: "meta"; conversationId: string; tone: string; toneCues: string[]; provider: string; model: string }
  | { type: "delta"; text: string }
  | {
      type: "done";
      messageId: string | null;
      stop: string;
      usage: { inputTokens: number; outputTokens: number; estimated: boolean; costUsd: number };
      warnings: string[];
    }
  /** `detail`: the provider's own message, credentials redacted. */
  | { type: "error"; code: string; message: string; reason?: string; detail?: string };
