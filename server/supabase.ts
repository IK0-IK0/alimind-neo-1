import "dotenv/config";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/types";

function requiredEnvironmentVariable(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} in .env.`);
  return value;
}

const supabaseUrl = requiredEnvironmentVariable("VITE_SUPABASE_URL");
const publishableKey = requiredEnvironmentVariable("VITE_SUPABASE_PUBLISHABLE_KEY");

export type UserSupabaseClient = SupabaseClient<Database, "public", "public">;

export function createUserClient(accessToken: string): UserSupabaseClient {
  return createClient<Database, "public", "public">(supabaseUrl, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });
}
