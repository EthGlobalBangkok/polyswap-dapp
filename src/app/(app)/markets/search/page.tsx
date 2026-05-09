import { Suspense } from "react";
import { MarketsSearchResults } from "@/components/markets";

export const metadata = {
  title: "Search · Polyswap",
};

export default function MarketsSearchPage() {
  return (
    <Suspense fallback={null}>
      <MarketsSearchResults />
    </Suspense>
  );
}
