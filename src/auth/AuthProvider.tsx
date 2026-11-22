import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { getAuthClient } from "./client";
import { isSupabaseConfigured, SUPABASE_CONFIG_ERROR } from "../lib/supabase/client";

type AuthContextValue = {
  user: User | null;
  isPending: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isPending, setIsPending] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setIsPending(false);
      setError(SUPABASE_CONFIG_ERROR);
      return;
    }

    let active = true;
    const authClient = getAuthClient();
    const { data: { subscription } } = authClient.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      setIsPending(false);
      setError(null);
    });

    void authClient.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) throw sessionError;
      setUser(data.session?.user ?? null);
      setIsPending(false);
      setError(null);
    }).catch((sessionError: unknown) => {
      if (!active) return;
      setIsPending(false);
      setError(sessionError instanceof Error ? sessionError.message : "Could not check your sign-in session.");
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function refresh() {
    const { data, error: sessionError } = await getAuthClient().getSession();
    if (sessionError) {
      setError(sessionError.message);
      throw sessionError;
    }
    setUser(data.session?.user ?? null);
    setError(null);
    setIsPending(false);
  }

  return (
    <AuthContext.Provider value={{ user, isPending, error, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider.");
  return value;
}
