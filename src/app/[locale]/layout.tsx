import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { Inter, Playfair_Display, Noto_Sans_Ethiopic } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-inter",
  display: "swap",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["600", "700"],
  style: ["normal", "italic"],
  variable: "--font-playfair",
  display: "swap",
});

const notoEthiopic = Noto_Sans_Ethiopic({
  subsets: ["ethiopic"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-ethiopic",
  display: "swap",
});
import { ThemeProvider } from "@/context/ThemeContext";
import { CartProvider } from "@/context/CartContext";
import { ToastProvider } from "@/components/ui/Toast";
import AppShell from "@/components/AppShell";
import PageProgress from "@/components/ui/PageProgress";
import AnnouncementBanner from "@/components/customer/AnnouncementBanner";
import type { Metadata } from "next";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { Announcement } from "@/app/[locale]/admin/announcements/AnnouncementsClient";
import { getFeatures } from "@/lib/featuresServer";
import { FeaturesProvider } from "@/context/FeaturesContext";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return {
    alternates: {
      canonical: "/",
      languages: { en: "/en", am: "/am" },
    },
    other: { "content-language": locale },
  };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

async function fetchActiveAnnouncements(): Promise<Announcement[]> {
  try {
    const now = new Date().toISOString();
    const { data, error } = await getSupabaseAdmin()
      .from("announcements")
      .select("*")
      .eq("is_active", true)
      .or(`starts_at.is.null,starts_at.lte.${now}`)
      .or(`ends_at.is.null,ends_at.gte.${now}`)
      .order("created_at", { ascending: false });

    if (error) return [];
    return (data ?? []) as Announcement[];
  } catch {
    return [];
  }
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const features = await getFeatures();
  const [messages, announcements] = await Promise.all([
    getMessages(),
    features.announcements ? fetchActiveAnnouncements() : Promise.resolve([]),
  ]);

  return (
    <html lang={locale} dir="ltr">
      <body className={`${inter.variable} ${playfair.variable} ${notoEthiopic.variable}`}>
        <ThemeProvider>
          <FeaturesProvider value={features}>
          <CartProvider>
            <NextIntlClientProvider messages={messages}>
              <ToastProvider>
                <PageProgress />
                <AnnouncementBanner announcements={announcements} />
                <AppShell>
                  {children}
                </AppShell>
              </ToastProvider>
            </NextIntlClientProvider>
          </CartProvider>
          </FeaturesProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
