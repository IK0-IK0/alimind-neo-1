import type { Json } from "./types";

export function arrayFromJson<T>(value: Json, label: string): T[] {
  if (!Array.isArray(value)) throw new Error(`Stored ${label} data is not a JSON array.`);
  return value as T[];
}
