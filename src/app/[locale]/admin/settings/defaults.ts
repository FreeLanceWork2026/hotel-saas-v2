// Plain module: a "use server" file may only export async functions, so the
// settings shape and defaults live here.

export type SiteSettings = {
  brand_name: string;
  brand_tagline: string;
  logo_url: string;
  brand_icon: string;
  address: string;
  phone: string;
  whatsapp: string;
  business_hours: string;
  hero_title: string;
  hero_subtitle: string;
  facebook_url: string;
  instagram_url: string;
  telegram_url: string;
  primary_color: string;
  /** Reservation retainer % (used only when the "retainer" platform switch is ON) */
  retainer_percent: string;
};

export const SETTING_DEFAULTS: SiteSettings = {
  brand_name:     "Entoto Haven",
  brand_tagline:  "Hotel & Restaurant",
  logo_url:       "",
  brand_icon:     "🏨",
  address:        "Bole Road, Addis Ababa, Ethiopia",
  phone:          "+251 91 234 5678",
  whatsapp:       "+251912345678",
  business_hours: "Mon–Sun: 7AM – 10PM",
  hero_title:     "Real Food, Real Flavour",
  hero_subtitle:  "From sizzling plates to refreshing drinks — every order prepared fresh.",
  facebook_url:   "",
  instagram_url:  "",
  telegram_url:   "",
  primary_color:  "#d94f28",
  retainer_percent: "50",
};
