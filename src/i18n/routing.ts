import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  // Supported locales — en (English) and am (Amharic)
  locales: ["en", "am"],

  // Default locale when no prefix is present
  defaultLocale: "en",

  // Use path prefix strategy: /en/... and /am/...
  // Default locale (en) will NOT have a prefix for clean URLs
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];
