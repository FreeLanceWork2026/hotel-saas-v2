"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  LayoutDashboard, Package, Archive, Users,
  ShoppingCart, Store, LogOut, Loader2, Monitor, BarChart2, CreditCard, Activity, X, Megaphone, SlidersHorizontal,
  CalendarDays, BedDouble, Wallet,
} from "lucide-react";
import styles from "./AdminLayout.module.css";
import { useFeatures } from "@/context/FeaturesContext";
import type { FeatureKey } from "@/lib/features";

interface SidebarProps { locale: string; open?: boolean; onClose?: () => void; }

const navItems: { href: string; label: string; icon: typeof LayoutDashboard; exact?: boolean; feature?: FeatureKey }[] = [
  { href: "/admin",            label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/bookings",   label: "Bookings",  icon: CalendarDays, feature: "booking" },
  { href: "/admin/rooms",      label: "Rooms",     icon: BedDouble,    feature: "booking" },
  { href: "/admin/balances",   label: "Balances",  icon: Wallet,       feature: "credit" },
  { href: "/admin/orders",     label: "Orders",    icon: ShoppingCart },
  { href: "/admin/payments",   label: "Payments",  icon: CreditCard },
  { href: "/admin/products",   label: "Products",  icon: Package },
  { href: "/admin/inventory",      label: "Inventory",      icon: Archive,    feature: "inventory" },
  { href: "/admin/employees",      label: "Employees",      icon: Users },
  { href: "/admin/announcements",  label: "Announcements",  icon: Megaphone,  feature: "announcements" },
  { href: "/admin/activity",       label: "Activity",       icon: Activity,   feature: "activity" },
  { href: "/admin/reports",        label: "Reports",        icon: BarChart2,  feature: "reports" },
  { href: "/admin/settings",       label: "Site Settings",  icon: SlidersHorizontal },
];

export default function AdminSidebar({ locale, open = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const features = useFeatures();
  const [isPending, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  const isActive = (href: string, exact?: boolean) => {
    const full = `/${locale}${href}`;
    return exact ? pathname === full : pathname.startsWith(full);
  };

  const navigate = (href: string) => {
    const full = `/${locale}${href}`;
    if (pathname === full) return;
    setPendingHref(full);
    startTransition(() => {
      router.push(full);
    });
  };

  return (
    <aside className={`${styles.sidebar} ${open ? styles.sidebarOpen : ""}`}>
      {/* Logo */}
      <div className={styles.logoArea}>
        <div className={styles.logoMark}>
          <div className={styles.logoIcon}>🏨</div>
          <div className={styles.logoText}>
            <span className={styles.logoName}>Entoto Haven</span>
            <span className={styles.logoSub}>Admin Panel</span>
          </div>
        </div>
        <button type="button" className={styles.sidebarClose} onClick={onClose} aria-label="Close menu">
          <X size={18} />
        </button>
      </div>

      {/* Navigation */}
      <nav className={styles.navSection}>
        <span className={styles.navLabel}>Main</span>
        {navItems.filter((item) => !item.feature || features[item.feature]).map(({ href, label, icon: Icon, exact }) => {
          const full = `/${locale}${href}`;
          const active = isActive(href, exact);
          const loading = isPending && pendingHref === full;
          return (
            <button
              key={href}
              onClick={() => navigate(href)}
              className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`}
            >
              {loading
                ? <Loader2 size={16} className={`${styles.navIcon} ${styles.spin}`} />
                : <Icon size={16} className={styles.navIcon} />
              }
              {label}
              {loading && <span className={styles.navLoading} />}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className={styles.sidebarFooter}>
        <Link href={`/${locale}`} className={styles.sidebarFooterLink}>
          <Store size={15} />
          View Store
        </Link>
        {features.kiosk_pos && (
          <Link href={`/${locale}/kiosk`} className={styles.sidebarFooterLink} target="_blank">
            <Monitor size={15} />
            Kiosk Mode
          </Link>
        )}
        <Link
          href={`/${locale}/admin/sign-out`}
          className={`${styles.sidebarFooterLink} ${styles.danger}`}
        >
          <LogOut size={15} />
          Sign Out
        </Link>
      </div>
    </aside>
  );
}
