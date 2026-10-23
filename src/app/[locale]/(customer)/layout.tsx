import React from "react";

// AppShell in [locale]/layout.tsx now handles Navbar + Footer
// for all customer pages based on pathname. This file is kept
// as a passthrough to maintain the (customer) route group.
export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
