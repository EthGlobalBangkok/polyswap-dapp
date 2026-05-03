import { type NextRequest, NextResponse } from "next/server";
import { DatabaseService } from "@/backend/services/databaseService";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const raw = sp.get("categories");
  const categories = raw
    ? raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  if (categories.length === 0) {
    return NextResponse.json(
      { success: false, error: "categories query param is required (comma-separated)" },
      { status: 400 }
    );
  }
  if (categories.length > 50) {
    return NextResponse.json(
      { success: false, error: "too many categories (max 50)" },
      { status: 400 }
    );
  }

  try {
    const [byCategory, total] = await Promise.all([
      DatabaseService.getMarketCountsByCategory(categories),
      DatabaseService.countMarkets({ categories }),
    ]);
    return NextResponse.json({ success: true, data: { byCategory, total } });
  } catch (err) {
    console.error("Market counts error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "counts failed" },
      { status: 500 }
    );
  }
}
