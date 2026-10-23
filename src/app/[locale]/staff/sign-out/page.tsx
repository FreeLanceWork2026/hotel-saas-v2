import { redirect } from "next/navigation";
import { logout } from "@/app/[locale]/login/actions";

export default async function StaffSignOutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await logout();
  redirect(`/${locale}/login`);
}
