import { createClient } from "../lib/supabase/client";

export function getSupabaseClient() {
  return createClient();
}

export function getAuthClient() {
  return getSupabaseClient().auth;
}
