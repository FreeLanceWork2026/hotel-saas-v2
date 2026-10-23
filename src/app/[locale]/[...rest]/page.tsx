import { notFound } from "next/navigation";

// Unknown paths (and features switched OFF — see src/proxy.ts) render the localized 404.
export default function CatchAllNotFound() {
  notFound();
}
