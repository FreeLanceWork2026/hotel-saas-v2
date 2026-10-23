import { redirect } from "next/navigation";
import { logout } from "@/app/[locale]/login/actions";

// This page exists solely to handle the sign-out action server-side.
// The sidebar links here; hitting this route logs the user out and redirects.
export default async function SignOutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await logout();
  redirect(`/${locale}/login`);
}
