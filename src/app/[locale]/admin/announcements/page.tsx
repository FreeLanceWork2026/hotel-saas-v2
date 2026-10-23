import type { Metadata } from "next";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import AnnouncementsClient, { type Announcement } from "./AnnouncementsClient";

export const metadata: Metadata = {
  title: "Announcements | Admin",
  description: "Manage customer-facing announcements and banners",
};

async function fetchAnnouncements(): Promise<Announcement[]> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("announcements")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      // Table might not exist yet — return empty instead of crashing
      console.error("announcements fetch error:", error.message);
      return [];
    }
    return (data ?? []) as Announcement[];
  } catch {
    return [];
  }
}

export default async function AnnouncementsPage() {
  const announcements = await fetchAnnouncements();
  return <AnnouncementsClient announcements={announcements} />;
}
