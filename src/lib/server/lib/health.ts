import { prisma } from "../db";

export interface HealthStatus {
  status: "ok" | "degraded";
  uptime: number;
  timestamp: string;
  checks: {
    database: "ok" | "error";
    cache: "ok" | "error";
  };
}

export async function getHealth(): Promise<HealthStatus> {
  let dbStatus: "ok" | "error" = "error";
  let cacheStatus: "ok" | "error" = "error";

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = "ok";
  } catch {
    dbStatus = "error";
  }

  try {
    const { getRedis } = await import("../redis");
    const cache = await getRedis();
    await cache.get("health-check");
    cacheStatus = "ok";
  } catch {
    cacheStatus = "error";
  }

  return {
    status: dbStatus === "ok" ? "ok" : "degraded",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    checks: { database: dbStatus, cache: cacheStatus },
  };
}
