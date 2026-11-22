import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient, isSupabaseConfigured, SUPABASE_CONFIG_ERROR } from "./client";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Supabase configuration", () => {
  it("reports missing deployment variables without initializing the client", () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "");

    expect(isSupabaseConfigured()).toBe(false);
    expect(() => createClient()).toThrow(SUPABASE_CONFIG_ERROR);
  });
});
