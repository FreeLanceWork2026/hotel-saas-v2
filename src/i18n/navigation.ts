// Locale-aware navigation hooks — use these instead of next/navigation
// so that Link, useRouter, usePathname are all locale-prefix aware
import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

export const { Link, redirect, usePathname, useRouter } =
  createNavigation(routing);
