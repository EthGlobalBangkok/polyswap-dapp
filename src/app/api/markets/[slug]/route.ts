import { type NextRequest, NextResponse } from "next/server";
import { DatabaseService } from "@/backend/services/databaseService";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug: identifier } = await params;
  if (!identifier || identifier.length > 255) {
    return NextResponse.json({ success: false, error: "invalid identifier" }, { status: 400 });
  }

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
    return NextResponse.json({ success: true, data: market });
  } catch (err) {
    console.error("Market lookup error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "lookup failed" },
      { status: 500 }
    );
  }
}
