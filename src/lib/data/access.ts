// Access by module and action. The database decides what a person may do; these calls
// only read the catalogue and a person's grants, and ask the database to change them.
import { supabase } from "../supabase";

export interface CapabilityDef {
  key: string;
  module: string;
  action: string;
  label: string;
  description: string;
  sensitive: boolean;
}

export async function listCapabilityCatalogue(): Promise<CapabilityDef[]> {
  const { data, error } = await supabase
    .from("access_capabilities")
    .select("key, module, action, label, description, sensitive")
    .order("sort");
  if (error) throw error;
  return (data ?? []) as CapabilityDef[];
}

/** What each familiar job starts with, keyed by role. */
export async function listPresets(): Promise<Record<string, string[]>> {
  const { data, error } = await supabase.from("access_preset_capabilities").select("role, capability");
  if (error) throw error;
  const out: Record<string, string[]> = {};
  for (const r of data ?? []) (out[r.role as string] ??= []).push(r.capability as string);
  return out;
}

export async function getUserCapabilities(profileId: string): Promise<string[]> {
  const { data, error } = await supabase.from("user_capabilities").select("capability").eq("profile_id", profileId);
  if (error) throw error;
  return (data ?? []).map((r) => r.capability as string);
}

/** Replaces a person's access with exactly this list. The database refuses anything not allowed. */
export async function setUserCapabilities(profileId: string, capabilities: string[]): Promise<void> {
  const { error } = await supabase.rpc("set_user_capabilities", { p_user: profileId, p_caps: capabilities });
  if (error) throw error;
}

/** Everything the signed-in person may do (a developer may do everything). */
export async function getMyCapabilities(): Promise<string[]> {
  const { data, error } = await supabase.rpc("my_capabilities");
  if (error) throw error;
  return (data ?? []) as string[];
}
