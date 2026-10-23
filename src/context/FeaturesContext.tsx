"use client";

import { createContext, useContext } from "react";
import { resolveFeatures, type FeatureKey, type FeatureMap } from "@/lib/features";

const FeaturesContext = createContext<FeatureMap>(resolveFeatures(null));

export function FeaturesProvider({ value, children }: { value: FeatureMap; children: React.ReactNode }) {
  return <FeaturesContext.Provider value={value}>{children}</FeaturesContext.Provider>;
}

export function useFeatures(): FeatureMap {
  return useContext(FeaturesContext);
}

export function useFeature(key: FeatureKey): boolean {
  return useContext(FeaturesContext)[key];
}
