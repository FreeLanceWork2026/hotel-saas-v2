// Homepage — Server Component (great for SEO)
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import HeroSection from "@/components/customer/HeroSection";
import TrustSection from "@/components/customer/TrustSection";
import ProcessSnippet from "@/components/customer/ProcessSnippet";
import FeaturedProducts from "@/components/customer/FeaturedProducts";
import HomeFaq from "@/components/customer/HomeFaq";
import CtaSection from "@/components/customer/CtaSection";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "common" });
  return {
    title: `${t("appName")} | ${t("tagline")}`,
    description:
      locale === "am"
        ? "እንጦጦ ሄቨን — ትኩስ ምግብ እና መጠጦች። አዲስ አበባ ኢትዮጵያ።"
        : "Entoto Haven — Fresh food and drinks made to order in Addis Ababa, Ethiopia.",
  };
}

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  await getTranslations({ locale, namespace: "home" });

  return (
    <>
      <HeroSection />
      <TrustSection />
      <ProcessSnippet />
      <FeaturedProducts />
      <HomeFaq />
      <CtaSection />
    </>
  );
}
