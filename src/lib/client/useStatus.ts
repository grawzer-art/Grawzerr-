"use client";

import { useEffect, useState } from "react";

export interface AppStatus {
  supabaseConfigured: boolean;
  aiConfigured: boolean;
  allowlistConfigured: boolean;
  authenticated: boolean;
  email?: string;
  allowed?: boolean;
  ai?: {
    provider: string;
    label: string;
    model: string;
    paid: boolean;
    note: string;
    keyEnv: string;
    keyLikeEnvNames?: string[];
  };
  voice?: { transcription: boolean };
  budget?: { monthlyBudgetUsd: number; dailyRequestLimit: number; dailyTokenLimit: number; perMinuteLimit: number };
}

export function useStatus(): { status: AppStatus | null; error: boolean } {
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((s: AppStatus) => alive && setStatus(s))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, []);
  return { status, error };
}
