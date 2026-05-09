import { MarketDetail } from "@/components/markets";

interface Props {
  params: Promise<{ marketId: string }>;
}

export default async function MarketDetailPage({ params }: Props) {
  const { marketId } = await params;
  return <MarketDetail identifier={marketId} />;
}

export const metadata = {
  title: "Market · Polyswap",
};
