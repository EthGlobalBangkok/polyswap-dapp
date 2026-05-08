import { type NextRequest, NextResponse } from "next/server";
import { DatabaseService } from "@/backend/services/databaseService";

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug: identifier } = await params;
  if (!identifier || identifier.length > 255) {
    return NextResponse.json({ success: false, error: "invalid identifier" }, { status: 400 });
  }

  // Opt-in view tracking: callers that represent an actual user landing on
  // the market detail page pass `?track=1`. Side-traffic (e.g. swap rows,
  // create form) omits it so we don't inflate the count with internal lookups.
  const shouldTrack = req.nextUrl.searchParams.get("track") === "1";

  try {
    const isNumericId = /^\d+$/.test(identifier);
    const market = isNumericId
      ? ((await DatabaseService.getMarketById(identifier)) ??
        (await DatabaseService.getMarketBySlug(identifier)))
      : ((await DatabaseService.getMarketBySlug(identifier)) ??
        (await DatabaseService.getMarketById(identifier)));

    if (!market) {
      return NextResponse.json({ success: false, error: "Market not found" }, { status: 404 });
    }

    if (shouldTrack) {
      // Fire-and-forget. View tracking must never block the response or fail
      // the request — the count is a soft signal, not a contract.
      void DatabaseService.incrementMarketViews(identifier).catch((err) => {
        console.error("View increment failed:", err);
      });
    }

    return NextResponse.json({ success: true, data: market });
  } catch (err) {
    console.error("Market lookup error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "lookup failed" },
      { status: 500 }
    );
  }
}
