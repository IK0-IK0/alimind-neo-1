import { describe, expect, it, vi } from "vitest";
import { createExchangeRateProvider } from "./exchange-rate";

describe("USD to PHP exchange rate", () => {
  it("uses and caches a valid Frankfurter quote", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      date: "2026-11-11",
      rates: { PHP: 63.251 },
    }), { status: 200 }));
    let now = 1_000;
    const getRate = createExchangeRateProvider({ fetcher, now: () => now });

    await expect(getRate()).resolves.toEqual({
      usdToPhp: 63.251,
      date: "2026-11-11",
      source: "Frankfurter",
    });
    now += 1_000;
    await getRate();

    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("falls back to the configured rate when the quote service is unavailable", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => { throw new Error("offline"); });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const getRate = createExchangeRateProvider({
      fetcher,
      fallbackRate: 62,
      fallbackDate: "2026-11-10",
    });

    await expect(getRate()).resolves.toEqual({
      usdToPhp: 62,
      date: "2026-11-10",
      source: "fallback",
    });
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("rejects an invalid configured fallback rate", () => {
    expect(() => createExchangeRateProvider({ fallbackRate: 0 })).toThrow(
      "USD_TO_PHP_FALLBACK_RATE must be a positive number.",
    );
  });
});
