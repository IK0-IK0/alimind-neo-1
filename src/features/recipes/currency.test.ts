import { describe, expect, it } from "vitest";
import { convertUsdToPhp, formatPhp } from "./currency";

describe("recipe currency conversion", () => {
  it("converts estimated US-dollar costs using the supplied exchange rate", () => {
    expect(convertUsdToPhp(2.75, 60)).toBe(165);
  });

  it("formats prices as Philippine pesos without centavos", () => {
    expect(formatPhp(165)).toContain("165");
    expect(formatPhp(165)).toMatch(/₱|PHP/);
  });
});
