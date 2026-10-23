import type { Metadata } from "next";
import { configuredPassword } from "@/lib/ownerSession";
import { loadFeatures } from "@/lib/featuresServer";
import { isPlatformOwner } from "./actions";
import PlatformClient from "./PlatformClient";

export const metadata: Metadata = {
  title: "Platform Settings",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function PlatformPage() {
  const configured = configuredPassword(process.env.PLATFORM_OWNER_PASSWORD) !== null;
  const signedIn = configured && (await isPlatformOwner());
  // Uncached so the owner always sees what is really stored
  const features = signedIn ? await loadFeatures() : null;

  return <PlatformClient configured={configured} features={features} />;
}
