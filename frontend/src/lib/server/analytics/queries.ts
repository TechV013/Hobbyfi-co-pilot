import { prisma } from "../db";
import { logger } from "../lib/logger";

export function computeDateRange(timeframe: string) {
  const now = new Date();
  const startDate: Date = new Date();
  const endDate: Date = new Date(now);
  let previousStartDate: Date | undefined;
  let previousEndDate: Date | undefined;

  switch (timeframe) {
    case "7d":
      startDate.setTime(now.getTime() - 7 * 86400000);
      previousStartDate = new Date(startDate.getTime() - 7 * 86400000);
      break;
    case "30d":
      startDate.setTime(now.getTime() - 30 * 86400000);
      previousStartDate = new Date(startDate.getTime() - 30 * 86400000);
      break;
    case "90d":
      startDate.setTime(now.getTime() - 90 * 86400000);
      previousStartDate = new Date(startDate.getTime() - 90 * 86400000);
      break;
    case "this_month":
      startDate.setFullYear(now.getFullYear(), now.getMonth(), 1);
      startDate.setHours(0, 0, 0, 0);
      previousStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      previousEndDate = new Date(now.getFullYear(), now.getMonth(), 0);
      break;
    case "last_month":
      startDate.setFullYear(now.getFullYear(), now.getMonth() - 1, 1);
      startDate.setHours(0, 0, 0, 0);
      endDate.setFullYear(now.getFullYear(), now.getMonth(), 0);
      endDate.setHours(23, 59, 59, 999);
      previousStartDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      break;
  }

  return { startDate, endDate, previousStartDate, previousEndDate };
}

export async function queryRevenue(vendorId: string, timeframe: string) {
  const { startDate, endDate, previousStartDate } = computeDateRange(timeframe);

  const records = await prisma.revenue.findMany({
    where: { vendorId, date: { gte: startDate, lte: endDate } },
    orderBy: { date: "asc" },
  });

  let previousRecords: Awaited<typeof records> = [];
  if (previousStartDate) {
    previousRecords = await prisma.revenue.findMany({
      where: { vendorId, date: { gte: previousStartDate, lt: startDate } },
      orderBy: { date: "asc" },
    });
  }

  const totalRevenue = records.reduce((s, r) => s + Number(r.totalRevenue), 0);
  const totalOnline = records.reduce((s, r) => s + Number(r.onlineRevenue), 0);
  const totalOffline = records.reduce((s, r) => s + Number(r.offlineRevenue), 0);
  const prevTotal = previousRecords.reduce((s, r) => s + Number(r.totalRevenue), 0);
  const revenueChange = prevTotal > 0 ? ((totalRevenue - prevTotal) / prevTotal) * 100 : 0;

  return {
    dailyRevenue: records.map((r) => ({
      date: r.date.toISOString().split("T")[0],
      total: Number(r.totalRevenue),
      online: Number(r.onlineRevenue),
      offline: Number(r.offlineRevenue),
    })),
    totalRevenue,
    totalOnline,
    totalOffline,
    revenueChange: Math.round(revenueChange * 100) / 100,
    recordCount: records.length,
  };
}

export async function queryBookingTrends(vendorId: string, timeframe: string, sport?: string) {
  const { startDate, endDate } = computeDateRange(timeframe);

  const where: Record<string, unknown> = { vendorId, date: { gte: startDate, lte: endDate } };
  if (sport) where.sport = sport;

  const groups = await prisma.booking.groupBy({
    by: ["date", "status"],
    where: where as any,
    _count: { id: true },
    orderBy: { date: "asc" },
  });

  const dailyMap = new Map<string, { date: string; total: number; confirmed: number; cancelled: number; other: number }>();
  for (const g of groups) {
    const key = g.date.toISOString().split("T")[0];
    if (!dailyMap.has(key)) {
      dailyMap.set(key, { date: key, total: 0, confirmed: 0, cancelled: 0, other: 0 });
    }
    const entry = dailyMap.get(key)!;
    const count = g._count.id;
    entry.total += count;
    if (g.status === "confirmed") entry.confirmed += count;
    else if (g.status === "cancelled") entry.cancelled += count;
    else entry.other += count;
  }

  const daily = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  const totalBookings = groups.reduce((s, g) => s + g._count.id, 0);

  const sportGroups = await prisma.booking.groupBy({
    by: ["sport"],
    where: where as any,
    _count: { id: true },
  });

  return {
    daily,
    totalBookings,
    sportBreakdown: sportGroups.map((g) => ({ sport: g.sport, count: g._count.id })).sort((a, b) => b.count - a.count),
  };
}

export async function queryTrialConversion(vendorId: string) {
  const totalUsers = await prisma.user.count({ where: { vendorId } });
  const trialUsers = await prisma.user.count({ where: { vendorId, trialStatus: true } });
  const paidUsers = totalUsers - trialUsers;
  const conversionRate = totalUsers > 0 ? (paidUsers / totalUsers) * 100 : 0;

  return {
    totalUsers,
    trialUsers,
    paidUsers,
    conversionRate: Math.round(conversionRate * 100) / 100,
  };
}

export async function queryMembershipGrowth(vendorId: string, timeframe: string) {
  const { startDate } = computeDateRange(timeframe);

  const users = await prisma.user.findMany({
    where: { vendorId, membershipStart: { gte: startDate } },
    select: { membershipStart: true, membershipType: true },
    orderBy: { membershipStart: "asc" },
  });

  const monthMap = new Map<string, Map<string, number>>();
  for (const u of users) {
    const month = u.membershipStart.toISOString().slice(0, 7);
    if (!monthMap.has(month)) monthMap.set(month, new Map());
    const typeMap = monthMap.get(month)!;
    typeMap.set(u.membershipType, (typeMap.get(u.membershipType) || 0) + 1);
  }

  const monthlyGrowth = Array.from(monthMap.entries())
    .map(([month, types]) => ({
      month,
      total: Array.from(types.values()).reduce((s, c) => s + c, 0),
      breakdown: Object.fromEntries(types),
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const typeGroups = await prisma.user.groupBy({
    by: ["membershipType"],
    where: { vendorId },
    _count: { id: true },
  });

  return {
    monthlyGrowth,
    typeBreakdown: typeGroups.map((g) => ({ type: g.membershipType, count: g._count.id })).sort((a, b) => b.count - a.count),
    totalMembers: users.length,
  };
}

export async function queryCoachPerformance(vendorId: string) {
  const coachGroups = await prisma.user.groupBy({
    by: ["coachAssigned"],
    where: { vendorId, coachAssigned: { not: null } },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
  });

  const coaches = coachGroups.filter((g) => g.coachAssigned !== null).map((g) => ({
    coachName: g.coachAssigned,
    memberCount: g._count.id,
  }));

  return { coaches, totalCoaches: coaches.length };
}

export async function queryPeakHours(vendorId: string, timeframe: string) {
  const { startDate, endDate } = computeDateRange(timeframe);

  const groups = await prisma.booking.groupBy({
    by: ["slot"],
    where: { vendorId, date: { gte: startDate, lte: endDate } },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
  });

  const cancelledGroups = await prisma.booking.groupBy({
    by: ["slot"],
    where: { vendorId, date: { gte: startDate, lte: endDate }, status: "cancelled" },
    _count: { id: true },
  });

  const cancelledMap = new Map(cancelledGroups.map((g) => [g.slot, g._count.id]));
  const totalBookings = groups.reduce((s, g) => s + g._count.id, 0);

  return {
    slots: groups.map((g) => ({
      slot: g.slot,
      bookings: g._count.id,
      cancelled: cancelledMap.get(g.slot) || 0,
      percentage: totalBookings > 0 ? Math.round((g._count.id / totalBookings) * 10000) / 100 : 0,
    })),
    totalBookings,
  };
}

export async function queryCancellationRate(vendorId: string, timeframe: string) {
  const { startDate, endDate } = computeDateRange(timeframe);
  const where = { vendorId, date: { gte: startDate, lte: endDate } };

  const total = await prisma.booking.count({ where: where as any });
  const cancelled = await prisma.booking.count({ where: { ...where, status: "cancelled" } as any });
  const rate = total > 0 ? (cancelled / total) * 100 : 0;

  const bySport = await prisma.booking.groupBy({
    by: ["sport"],
    where: where as any,
    _count: { id: true },
  });

  const cancelledBySport = await prisma.booking.groupBy({
    by: ["sport"],
    where: { ...where, status: "cancelled" } as any,
    _count: { id: true },
  });

  const cancelledSportMap = new Map(cancelledBySport.map((g) => [g.sport, g._count.id]));
  const sportRates = bySport.map((g) => ({
    sport: g.sport,
    total: g._count.id,
    cancelled: cancelledSportMap.get(g.sport) || 0,
    rate: g._count.id > 0 ? Math.round(((cancelledSportMap.get(g.sport) || 0) / g._count.id) * 10000) / 100 : 0,
  }));

  return {
    totalBookings: total,
    cancelledBookings: cancelled,
    cancellationRate: Math.round(rate * 100) / 100,
    bySport: sportRates.sort((a, b) => b.rate - a.rate),
  };
}

export async function queryPaymentSuccessRate(vendorId: string, timeframe: string) {
  const { startDate, endDate } = computeDateRange(timeframe);

  const groups = await prisma.payment.groupBy({
    by: ["status", "method"],
    where: { vendorId, createdAt: { gte: startDate, lte: endDate } },
    _count: { id: true },
    _sum: { amount: true },
  });

  const statusCounts = new Map<string, { count: number; totalAmount: number }>();
  const methodCounts = new Map<string, { count: number; totalAmount: number }>();

  for (const g of groups) {
    {
      const s = statusCounts.get(g.status) || { count: 0, totalAmount: 0 };
      s.count += g._count.id;
      s.totalAmount += Number(g._sum.amount || 0);
      statusCounts.set(g.status, s);
    }
    {
      const m = methodCounts.get(g.method) || { count: 0, totalAmount: 0 };
      m.count += g._count.id;
      m.totalAmount += Number(g._sum.amount || 0);
      methodCounts.set(g.method, m);
    }
  }

  const totalPayments = groups.reduce((s, g) => s + g._count.id, 0);
  const successCount = statusCounts.get("success")?.count || 0;
  const successRate = totalPayments > 0 ? (successCount / totalPayments) * 100 : 0;

  return {
    totalPayments,
    successRate: Math.round(successRate * 100) / 100,
    byStatus: Array.from(statusCounts.entries()).map(([status, data]) => ({
      status,
      count: data.count,
      totalAmount: data.totalAmount,
      percentage: totalPayments > 0 ? Math.round((data.count / totalPayments) * 10000) / 100 : 0,
    })),
    byMethod: Array.from(methodCounts.entries()).map(([method, data]) => ({
      method,
      count: data.count,
      totalAmount: data.totalAmount,
      percentage: totalPayments > 0 ? Math.round((data.count / totalPayments) * 10000) / 100 : 0,
    })),
  };
}
