import { createClient } from "../lib/supabase/client";

export const supabase = createClient();
export const authClient = supabase.auth;
