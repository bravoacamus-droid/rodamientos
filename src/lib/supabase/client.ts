"use client";

import { createBrowserClient } from "@supabase/ssr";
import { credencialesSupabase } from "./config";

export function createClient() {
  const { url, anonKey } = credencialesSupabase();
  return createBrowserClient(url, anonKey);
}
