"use client";

import { usePathname } from "next/navigation";
import Navbar from "@/components/customer/Navbar";
import Footer from "@/components/customer/Footer";

// Pages that should NOT have customer nav/footer
const NO_SHELL_PREFIXES = ["/admin", "/login", "/kiosk", "/staff", "/platform", "/bill"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const isCustomer = !NO_SHELL_PREFIXES.some((prefix) =>
    // pathname may be /en/admin or /am/login — strip locale prefix first
    pathname.replace(/^\/(en|am)/, "").startsWith(prefix)
  );

  if (!isCustomer) {
    return <>{children}</>;
  }

  return (
    <>
      <Navbar />
      <main style={{ minHeight: "calc(100dvh - var(--nav-height, 72px))" }}>
        {children}
      </main>
      <Footer />
    </>
  );
}
