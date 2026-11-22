import { getSupabaseClient } from "../../auth/client";
import { isAccountRole } from "./roles";

export async function loadAccountRole(userId: string) {
  const { data, error } = await getSupabaseClient()
    .from("profiles")
    .select("account_role")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data || !isAccountRole(data.account_role)) {
    throw new Error("The account role is missing or invalid.");
  }
  return data.account_role;
}
