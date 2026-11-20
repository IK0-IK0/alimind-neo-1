export type AccountRole = "user" | "reviewer";

export function isAccountRole(value: unknown): value is AccountRole {
  return value === "user" || value === "reviewer";
}
