import { getSiteSettings } from "./actions";
import SettingsClient from "./SettingsClient";
import { getAdminActor } from "@/lib/adminAuth";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Site Settings — Admin" };

type Props = { params: Promise<{ locale: string }> };

export default async function SettingsPage({ params }: Props) {
  const { locale } = await params;
  const actor = await getAdminActor();
  if (!actor) redirect(`/${locale}/login`);

  const settings = await getSiteSettings();
  return <SettingsClient initial={settings} locale={locale} />;
}
