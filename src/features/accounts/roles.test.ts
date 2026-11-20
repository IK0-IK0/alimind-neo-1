import { describe, expect, it } from "vitest";
import { isAccountRole } from "./roles";

describe("account roles", () => {
  it("accepts only explicitly supported account roles", () => {
    expect(isAccountRole("user")).toBe(true);
    expect(isAccountRole("reviewer")).toBe(true);
    expect(isAccountRole("admin")).toBe(false);
    expect(isAccountRole(null)).toBe(false);
    expect(isAccountRole(undefined)).toBe(false);
  });
});
