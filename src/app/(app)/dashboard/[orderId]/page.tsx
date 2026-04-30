import { SwapDetailPage } from "@/components/dashboard";

interface Props {
  params: Promise<{ orderId: string }>;
}

export const metadata = {
  title: "Swap · Polyswap",
};

export default async function SwapDetailRoute({ params }: Props) {
  const { orderId } = await params;
  return <SwapDetailPage orderId={orderId} />;
}
