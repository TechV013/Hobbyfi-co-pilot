import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { logger } from "@/lib/server/lib/logger";

export async function POST(req: NextRequest) {
  try {
    const { vendorId } = await req.json();

    const validVendors: Record<string, string> = {
      "vendor-a-0001-0000-0000-000000000001": "Rahul Sharma",
      "vendor-b-0002-0000-0000-000000000002": "Priya Patel",
    };

    if (!vendorId || !validVendors[vendorId]) {
      return NextResponse.json(
        { error: { code: "INVALID_VENDOR", message: "Invalid vendor credentials" } },
        { status: 401 },
      );
    }

    const secret = process.env.JWT_SECRET!;
    const token = jwt.sign({ vendorId, vendorName: validVendors[vendorId] }, secret, {
      expiresIn: "1h",
      issuer: "hobbyfi",
    });

    logger.info("Demo login", { vendorId, vendorName: validVendors[vendorId] });
    return NextResponse.json({ token, vendorId, vendorName: validVendors[vendorId] });
  } catch (err) {
    return NextResponse.json(
      { error: { message: err instanceof Error ? err.message : "Internal error" } },
      { status: 500 },
    );
  }
}
