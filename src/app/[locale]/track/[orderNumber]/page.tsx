import type { Metadata } from "next";
import TrackPageClient from "./TrackPageClient";

type Props = { params: Promise<{ locale: string; orderNumber: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { orderNumber } = await params;
  return { title: `Track Order #${orderNumber} | Entoto Haven` };
}

export default async function TrackPage({ params }: Props) {
  const { orderNumber } = await params;
  return <TrackPageClient orderNumber={orderNumber} />;
}
