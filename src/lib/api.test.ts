import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authClient = vi.hoisted(() => ({
  getSession: vi.fn(),
  refreshSession: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("../auth/client", () => ({ getAuthClient: () => authClient }));

import { apiRequest } from "./api";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("apiRequest authentication", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.clearAllMocks();
    authClient.getSession.mockResolvedValue({
      data: { session: { access_token: "old-token" } },
      error: null,
    });
    authClient.refreshSession.mockResolvedValue({
      data: { session: { access_token: "new-token" } },
      error: null,
    });
    authClient.signOut.mockResolvedValue({ error: null });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("refreshes an expired access token and retries the request", async () => {
    const authorizations: string[] = [];
    fetchMock.mockImplementation(async (_input, init) => {
      authorizations.push(new Headers(init?.headers).get("Authorization") ?? "");
      return authorizations.length === 1
        ? jsonResponse(401, { error: "Unauthorized" })
        : jsonResponse(200, { ok: true });
    });

    await expect(apiRequest("/api/reviewer/recipes")).resolves.toEqual({ ok: true });

    expect(authClient.refreshSession).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [firstAuthorization, retryAuthorization] = authorizations;
    expect(firstAuthorization?.startsWith("Bearer ")).toBe(true);
    expect(retryAuthorization?.startsWith("Bearer ")).toBe(true);
    expect(retryAuthorization).not.toBe(firstAuthorization);
  });

  it("clears a session when its refresh token is rejected", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: "Unauthorized" }));
    authClient.refreshSession.mockResolvedValue({
      data: { session: null },
      error: Object.assign(new Error("Invalid Refresh Token"), { status: 400 }),
    });

    await expect(apiRequest("/api/reviewer/recipes")).rejects.toThrow(
      "Your sign-in has expired. Please sign in again.",
    );

    expect(authClient.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("reports a signed-out request without attempting a refresh", async () => {
    authClient.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    await expect(apiRequest("/api/recipes/generate", { method: "POST" })).rejects.toThrow(
      "Please sign in to continue.",
    );

    expect(authClient.refreshSession).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not refresh the session for non-authentication failures", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { error: "Forbidden" }));

    await expect(apiRequest("/api/reviewer/recipes")).rejects.toThrow("Forbidden");

    expect(authClient.refreshSession).not.toHaveBeenCalled();
  });

  it("shows server diagnostics and a reference ID for internal errors", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, {
      error: "Recipe index is unavailable.",
      requestId: "request-123",
    }));

    await expect(apiRequest("/api/reviewer/recipes")).rejects.toThrow(
      "Recipe index is unavailable. (Reference: request-123)",
    );
  });
});
