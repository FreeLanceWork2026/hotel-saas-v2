// SERVER-SIDE ONLY — read feature switches from the database.
import { cache } from "react";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveFeatures, type FeatureKey, type FeatureMap } from "@/lib/features";

/** Uncached read. A missing table or env falls back to defaults (new modules stay locked). */
export async function loadFeatures(): Promise<FeatureMap> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("platform_features")
      .select("key, enabled");
    return resolveFeatures(error ? null : data);
  } catch {
    return resolveFeatures(null);
  }
}

/** Per-request cached read for layouts, pages and server actions. */
export const getFeatures = cache(loadFeatures);

export async function isFeatureOn(key: FeatureKey): Promise<boolean> {
  return (await getFeatures())[key];
}
