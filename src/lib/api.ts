import { authClient } from "../auth/client";

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const { data: sessionData, error: sessionError } = await authClient.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData.session) {
    throw new Error("Please sign in to continue.");
  }
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (sessionData.session.access_token) {
    headers.set("Authorization", `Bearer ${sessionData.session.access_token}`);
  }
  const sendRequest = () => fetch(path, {
    ...init,
    credentials: "same-origin",
    headers,
  });
  let response = await sendRequest();

  if (response.status === 401) {
    const { data: refreshed, error: refreshError } = await authClient.refreshSession();
    if (refreshError?.status === 0) {
      throw new Error("Couldn’t refresh your sign-in. Check your connection and try again.");
    }

    if (refreshError || !refreshed.session) {
      const { error: signOutError } = await authClient.signOut({ scope: "local" });
      if (signOutError) {
        throw new Error(`Your sign-in has expired. Please sign in again. ${signOutError.message}`);
      }
      throw new Error("Your sign-in has expired. Please sign in again.");
    }

    headers.set("Authorization", ["Bearer", refreshed.session.access_token].join(" "));
    response = await sendRequest();
    if (response.status === 401) {
      const { error: signOutError } = await authClient.signOut({ scope: "local" });
      if (signOutError) {
        throw new Error(`Your session could not be verified. Please sign in again. ${signOutError.message}`);
      }
      throw new Error("Your session could not be verified. Please sign in again.");
    }
  }

  const payload = await response.json().catch(() => null) as { error?: string } | T | null;
  if (!response.ok) {
    const errorMessage = payload && typeof payload === "object" && "error" in payload
      ? payload.error
      : undefined;
    const message = typeof errorMessage === "string"
      ? errorMessage
      : `Request failed (${response.status}).`;
    throw new Error(message);
  }
  if (!payload) throw new Error("The server returned an empty response.");
  return payload as T;
}
