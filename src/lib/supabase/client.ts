import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

let client: SupabaseClient<Database> | undefined;

const AUTH_REQUEST_TIMEOUT_MS = 15_000;

async function fetchWithAuthTimeout(input: RequestInfo | URL, init?: RequestInit) {
  const requestUrl = typeof input === "string"
    ? input
    : input instanceof URL
      ? input.href
      : input.url;
  const url = new URL(requestUrl, import.meta.env.VITE_SUPABASE_URL);
  const isSignUp = url.pathname.endsWith("/auth/v1/signup");
  const isPasswordSignIn =
    url.pathname.endsWith("/auth/v1/token") &&
    url.searchParams.get("grant_type") === "password";

  if (!isSignUp && !isPasswordSignIn) return fetch(input, init);

  const controller = new AbortController();
  const requestSignal = init?.signal;
  const abortRequest = () => controller.abort(requestSignal?.reason);
  if (requestSignal?.aborted) {
    abortRequest();
  } else {
    requestSignal?.addEventListener("abort", abortRequest, { once: true });
  }

  let timedOut = false;
  const timeoutId = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, AUTH_REQUEST_TIMEOUT_MS);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) {
      throw new Error("The authentication service took too long to respond. Check your connection and try again.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
    requestSignal?.removeEventListener("abort", abortRequest);
  }
}

export function createClient() {
  if (!client) {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !publishableKey) {
      throw new Error("Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env before starting AliMind.");
    }
    client = createBrowserClient<Database, "public">(url, publishableKey, {
      global: { fetch: fetchWithAuthTimeout },
    });
  }
  return client;
}
