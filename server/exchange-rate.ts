import type { RecipeExchangeRate } from "../src/features/recipes/types.js";

const FRANKFURTER_URL = "https://api.frankfurter.dev/v1/latest?base=USD&symbols=PHP";
const CACHE_DURATION_MS = 12 * 60 * 60 * 1000;
const DEFAULT_FALLBACK_RATE = 63.251;
const DEFAULT_FALLBACK_DATE = "2026-11-11";

type ExchangeRateProviderOptions = {
  fetcher?: typeof fetch;
  fallbackRate?: number;
  fallbackDate?: string;
  now?: () => number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoDate(value: string) {
  const parsed = new Date(`${value}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(parsed.getTime())
    && parsed.toISOString().slice(0, 10) === value;
}

export function createExchangeRateProvider({
  fetcher = fetch,
  fallbackRate = Number(process.env.USD_TO_PHP_FALLBACK_RATE ?? DEFAULT_FALLBACK_RATE),
  fallbackDate = process.env.USD_TO_PHP_FALLBACK_DATE ?? DEFAULT_FALLBACK_DATE,
  now = Date.now,
}: ExchangeRateProviderOptions = {}) {
  if (!Number.isFinite(fallbackRate) || fallbackRate <= 0) {
    throw new Error("USD_TO_PHP_FALLBACK_RATE must be a positive number.");
  }
  if (!isIsoDate(fallbackDate)) {
    throw new Error("USD_TO_PHP_FALLBACK_DATE must use YYYY-MM-DD.");
  }

  let cached: { quote: RecipeExchangeRate; cachedAt: number } | null = null;

  return async function getUsdToPhpRate(): Promise<RecipeExchangeRate> {
    if (cached && now() - cached.cachedAt < CACHE_DURATION_MS) return cached.quote;

    try {
      const response = await fetcher(FRANKFURTER_URL, { signal: AbortSignal.timeout(4_000) });
      if (!response.ok) throw new Error(`Exchange-rate service returned HTTP ${response.status}.`);
      const payload: unknown = await response.json();
      if (!isRecord(payload) || !isRecord(payload.rates)) {
        throw new Error("Exchange-rate service returned an unexpected response.");
      }
      const usdToPhp = payload.rates.PHP;
      const date = payload.date;
      if (
        typeof usdToPhp !== "number" || !Number.isFinite(usdToPhp) || usdToPhp <= 0
        || typeof date !== "string" || !isIsoDate(date)
      ) {
        throw new Error("Exchange-rate service returned an invalid PHP quote.");
      }

      const quote: RecipeExchangeRate = { usdToPhp, date, source: "Frankfurter" };
      cached = { quote, cachedAt: now() };
      return quote;
    } catch (error) {
      if (cached) return cached.quote;
      const message = error instanceof Error ? error.message : "The exchange-rate service is unavailable.";
      console.warn(`Using the configured USD/PHP fallback rate: ${message}`);
      const quote: RecipeExchangeRate = {
        usdToPhp: fallbackRate,
        date: fallbackDate,
        source: "fallback",
      };
      cached = { quote, cachedAt: now() };
      return quote;
    }
  };
}

export const getUsdToPhpRate = createExchangeRateProvider();
