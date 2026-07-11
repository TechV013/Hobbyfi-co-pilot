import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export async function GET() {
  let dbStatus: "ok" | "error" = "error";
  let cacheStatus: "ok" | "error" = "error";

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = "ok";
  } catch {
    dbStatus = "error";
  }

  try {
    const { getRedis } = await import("@/lib/server/redis");
    const cache = await getRedis();
    await cache.get("health-check");
    cacheStatus = "ok";
  } catch {
    cacheStatus = "error";
  }

  const status = dbStatus === "ok" ? "ok" : "degraded";

  return NextResponse.json(
    {
      status,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      checks: { database: dbStatus, cache: cacheStatus },
    },
    { status: status === "ok" ? 200 : 503 },
  );
}
