// Root layout — only sets html/body structure
// Locale-specific metadata is in [locale]/layout.tsx
import type { Metadata } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: {
    default: "Entoto Haven | Hotel & Restaurant",
    template: "%s | Entoto Haven",
  },
  description:
    "Fresh food and drinks made to order in Addis Ababa, Ethiopia. Dine in, take away, or order to your door.",
  keywords: ["restaurant", "food", "drinks", "Ethiopia", "Addis Ababa", "እንጦጦ ሄቨን"],
  openGraph: {
    siteName: "Entoto Haven",
    locale: "en_ET",
    alternateLocale: ["am_ET"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
