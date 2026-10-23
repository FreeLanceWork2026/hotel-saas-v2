"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Store, Menu } from "lucide-react";
import styles from "./AdminLayout.module.css";
import AdminSidebar from "./AdminSidebar";
import ThemeToggle from "@/components/ui/ThemeToggle";

/**
 * Admin chrome: sidebar (off-canvas drawer on phones), top header with the
 * theme switch, and the page area. Server pages render inside `children`.
 */
export default function AdminShell({
  locale,
  children,
}: {
  locale: string;
  children: React.ReactNode;
}) {
  const [navOpen, setNavOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer after navigating
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setNavOpen(false);
  }

  // Lock background scroll while the drawer is open
  useEffect(() => {
    document.body.style.overflow = navOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [navOpen]);

  return (
    <div className={styles.adminContainer}>
      <div
        className={`${styles.sidebarOverlay} ${navOpen ? styles.sidebarOverlayOpen : ""}`}
        onClick={() => setNavOpen(false)}
        aria-hidden="true"
      />

      <AdminSidebar locale={locale} open={navOpen} onClose={() => setNavOpen(false)} />

      <main className={styles.mainContent}>
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <button
              type="button"
              className={styles.menuBtn}
              onClick={() => setNavOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={18} />
            </button>
            <div className={styles.breadcrumb}>
              <span>Entoto Haven</span>
              <span className={styles.breadcrumbSep}>/</span>
              <span className={styles.breadcrumbCurrent}>Admin</span>
            </div>
          </div>
          <div className={styles.headerRight}>
            <ThemeToggle />
            <Link href={`/${locale}`} className={styles.headerStoreBtn}>
              <Store size={13} />
              View Store
            </Link>
            <Link href={`/${locale}/admin/sign-out`} className={styles.headerSignOut}>
              Sign Out
            </Link>
          </div>
        </header>

        <div className={styles.pageContent}>{children}</div>
      </main>
    </div>
  );
}
