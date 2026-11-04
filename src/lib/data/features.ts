// Features a school can switch on or off. The database decides what is really on; these calls read
// the catalogue and the school's choices, and ask the database to change them.
import { supabase } from "../supabase";

export interface FeatureDef {
  key: string;
  label: string;
  description: string;
  kind: "module" | "channel";
  requires: string[];
}

export async function listFeatureCatalogue(): Promise<FeatureDef[]> {
  const { data, error } = await supabase.from("app_features").select("key, label, description, kind, requires").order("sort");
  if (error) throw error;
  return (data ?? []) as FeatureDef[];
}

/** The keys of the features that are switched off for the signed-in person's school. */
export async function getDisabledFeatures(): Promise<string[]> {
  const { data, error } = await supabase.rpc("my_disabled_features");
  if (error) throw error;
  return (data ?? []) as string[];
}

/** Replaces the set of features that are on with exactly this list. The database refuses an impossible set. */
export async function setSchoolFeatures(on: string[]): Promise<void> {
  const { error } = await supabase.rpc("set_school_features", { p_on: on });
  if (error) throw error;
}
