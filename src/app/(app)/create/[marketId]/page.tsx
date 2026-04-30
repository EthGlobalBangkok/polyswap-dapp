import { CreatePage } from "@/components/create";

interface Props {
  params: Promise<{ marketId: string }>;
}

export const metadata = {
  title: "Set up a swap · Polyswap",
};

export default async function CreateRoutePage({ params }: Props) {
  const { marketId } = await params;
  return <CreatePage marketId={marketId} />;
}
