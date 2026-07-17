import { prisma } from "./db";
import { UserRepository } from "./repositories/user.repository";
import { RevenueRepository } from "./repositories/revenue.repository";
import {
  queryRevenue,
  queryBookingTrends,
  queryTrialConversion,
  queryMembershipGrowth,
  queryCoachPerformance,
  queryPeakHours,
  queryCancellationRate,
  queryPaymentSuccessRate,
} from "./analytics/queries";

type Intent = "member_search" | "revenue_query" | "booking_query" | "analytics_query" | "unknown";
interface RouteResult {
  intent: Intent;
  reply: string | null;
}

const userRepo = new UserRepository(prisma);
const revenueRepo = new RevenueRepository(prisma);

const sportMap: Record<string, string> = {
  cricket: "Cricket",
  football: "Football",
  badminton: "Badminton",
  swimming: "Swimming",
  yoga: "Yoga",
  gym: "Gym",
};

function extractMemberFilters(msg: string): Record<string, unknown> {
  const lower = msg.toLowerCase();
  const filters: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(sportMap)) {
    if (lower.includes(key)) { filters.sport = val; break; }
  }
  if (lower.includes("trial")) filters.trialOnly = true;
  if (lower.includes("expir")) filters.expiringWithinDays = 7;
  if (lower.includes("monthly") || lower.includes("month ")) filters.membershipType = "monthly";
  if (lower.includes("yearly") || lower.includes("annual")) filters.membershipType = "yearly";
  if (lower.includes("quarterly") || lower.includes("quarter ")) filters.membershipType = "quarterly";
  return filters;
}

function formatMemberList(users: { name: string; sport: string; membershipType: string }[]): string {
  if (users.length === 0) return "No members found.";
  const names = users.map((u) => `${u.name} (${u.sport}, ${u.membershipType})`);
  return `Found ${users.length} member(s): ${names.join(", ")}.`;
}

function extractRevenueRange(msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes("today")) return "today";
  if (lower.includes("yesterday")) return "yesterday";
  if (lower.includes("this week") || lower.includes("weekly")) return "this_week";
  if (lower.includes("last month")) return "last_month";
  return "this_month";
}

function extractBookingFilters(msg: string): Record<string, unknown> {
  const lower = msg.toLowerCase();
  const filters: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(sportMap)) {
    if (lower.includes(key)) { filters.sport = val; break; }
  }
  if (lower.includes("today")) {
    const t = new Date();
    filters.dateFrom = t.toISOString().split("T")[0];
    filters.dateTo = t.toISOString().split("T")[0];
  } else if (lower.includes("tomorrow")) {
    const d = new Date(); d.setDate(d.getDate() + 1);
    filters.dateFrom = d.toISOString().split("T")[0];
    filters.dateTo = d.toISOString().split("T")[0];
  }
  if (lower.includes("cancelled") || lower.includes("cancel")) filters.status = "cancelled";
  if (lower.includes("confirm") || lower.includes("upcoming")) filters.status = "confirmed";
  return filters;
}

function extractAnalyticsMetric(msg: string): string | null {
  const lower = msg.toLowerCase();
  if (lower.includes("revenue") && (lower.includes("trend") || lower.includes("analysis") || lower.includes("growth"))) return "revenue_analysis";
  if (lower.includes("booking") && (lower.includes("trend") || lower.includes("pattern") || lower.includes("volume"))) return "booking_trends";
  if (lower.includes("trial") && (lower.includes("conversion") || lower.includes("rate"))) return "trial_conversion";
  if (lower.includes("member") && (lower.includes("growth") || lower.includes("trend") || lower.includes("new"))) return "membership_growth";
  if (lower.includes("coach") && (lower.includes("perform") || lower.includes("member"))) return "coach_performance";
  if (lower.includes("peak") || lower.includes("busiest") || lower.includes("popular")) return "peak_hours";
  if (lower.includes("cancel") && lower.includes("rate")) return "cancellation_rate";
  if (lower.includes("payment") && (lower.includes("success") || lower.includes("rate"))) return "payment_success_rate";
  return null;
}

function detectIntent(msg: string): { intent: Intent; params: Record<string, unknown> } {
  const lower = msg.toLowerCase();
  const hasSportHint = lower.split(/\s+/).some((w) => sportMap[w] || /trial|expir|monthly|yearly|quarterly/.test(w));

  const isMemberQuery =
    /member|player|student|who\s+(all|every|joined|is|are)|list\s+(all|every|member|player)|show\s+(all|every|member|player)|find\s+(member|player)|all\s+(member|player)/i.test(msg) ||
    (hasSportHint &&
      !/revenue|income|earnings|booking|slot|session|analytics|trend|pattern|growth|conversion|peak/i.test(msg));

  if (isMemberQuery) return { intent: "member_search", params: extractMemberFilters(msg) };

  if (/revenue|income|earnings|money|profit/i.test(msg) && !/analytics|trend|pattern|growth/i.test(msg))
    return { intent: "revenue_query", params: { range: extractRevenueRange(msg) } };

  if (/booking|slot|session|schedule|booked/i.test(msg))
    return { intent: "booking_query", params: extractBookingFilters(msg) };

  const metric = extractAnalyticsMetric(msg);
  if (metric) {
    const tf = lower.includes("7d") || lower.includes("7 day") || lower.includes("week") ? "7d"
      : lower.includes("90d") || lower.includes("90 day") || lower.includes("quarter") ? "90d"
      : lower.includes("last month") ? "last_month" : "30d";
    return { intent: "analytics_query", params: { metric, timeframe: tf } };
  }

  return { intent: "unknown", params: {} };
}

export async function routeMessage(vendorId: string, message: string): Promise<RouteResult> {
  const { intent, params } = detectIntent(message);
  if (intent === "unknown") return { intent, reply: null };

  try {
    switch (intent) {
      case "member_search": {
        const users = await userRepo.search(vendorId, params as any);
        return { intent, reply: formatMemberList(users) };
      }

      case "revenue_query": {
        const range = (params.range as string) || "this_month";
        const ranges: Record<string, () => { startDate: Date; endDate: Date }> = {
          today: () => { const s = new Date(); s.setHours(0, 0, 0, 0); const e = new Date(); e.setHours(23, 59, 59, 999); return { startDate: s, endDate: e }; },
          yesterday: () => { const s = new Date(); s.setDate(s.getDate() - 1); s.setHours(0, 0, 0, 0); const e = new Date(); e.setDate(e.getDate() - 1); e.setHours(23, 59, 59, 999); return { startDate: s, endDate: e }; },
          this_week: () => { const s = new Date(); s.setDate(s.getDate() - s.getDay()); s.setHours(0, 0, 0, 0); const e = new Date(); e.setHours(23, 59, 59, 999); return { startDate: s, endDate: e }; },
          this_month: () => { const s = new Date(); s.setDate(1); s.setHours(0, 0, 0, 0); const e = new Date(); e.setHours(23, 59, 59, 999); return { startDate: s, endDate: e }; },
          last_month: () => { const s = new Date(); s.setMonth(s.getMonth() - 1); s.setDate(1); s.setHours(0, 0, 0, 0); const e = new Date(); e.setDate(0); e.setHours(23, 59, 59, 999); return { startDate: s, endDate: e }; },
        };
        const fn = ranges[range];
        if (!fn) return { intent, reply: `Revenue range "${range}" not recognized. Try: today, this month, last month.` };
        const { startDate, endDate } = fn();

        const records = await revenueRepo.query(vendorId, {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        });
        const total = records.reduce((s, r) => s + Number(r.totalRevenue), 0);
        const online = records.reduce((s, r) => s + Number(r.onlineRevenue), 0);
        const offline = records.reduce((s, r) => s + Number(r.offlineRevenue), 0);

        if (records.length === 0) return { intent, reply: `No revenue records found for ${range}.` };

        const label = range.replace(/_/g, " ");
        return {
          intent,
          reply: `Your ${label} revenue: ₹${total.toLocaleString("en-IN")} (Online: ₹${online.toLocaleString("en-IN")}, Offline: ₹${offline.toLocaleString("en-IN")}).`,
        };
      }

      case "booking_query": {
        const p = params as any;
        const filter: any = { vendorId };
        if (p.sport) filter.sport = p.sport;
        if (p.status) filter.status = p.status;
        if (p.dateFrom) {
          const sd = new Date(p.dateFrom); sd.setHours(0, 0, 0, 0);
          const ed = p.dateTo ? new Date(p.dateTo) : new Date(sd);
          ed.setHours(23, 59, 59, 999);
          filter.date = { gte: sd, lte: ed };
        }

        const bookings = await prisma.booking.findMany({
          where: filter,
          include: { user: { select: { name: true } } },
          orderBy: { date: "asc" },
          take: 20,
        });

        if (bookings.length === 0) return { intent, reply: "No bookings found." };

        const lines = bookings.map((b) => {
          const d = b.date.toISOString().split("T")[0];
          return `${b.user.name} — ${b.sport} — ${b.slot} — ${d} (${b.status})`;
        });
        return { intent, reply: `Found ${bookings.length} booking(s):\n${lines.join("\n")}` };
      }

      case "analytics_query": {
        const p = params as any;
        const metric = p.metric as string;
        const timeframe = p.timeframe as string;
        const queryMap: Record<string, (vid: string, tf: string, sport?: string) => Promise<unknown>> = {
          revenue_analysis: queryRevenue,
          booking_trends: queryBookingTrends,
          trial_conversion: (vid) => queryTrialConversion(vid),
          membership_growth: queryMembershipGrowth,
          coach_performance: (vid) => queryCoachPerformance(vid),
          peak_hours: queryPeakHours,
          cancellation_rate: queryCancellationRate,
          payment_success_rate: queryPaymentSuccessRate,
        };
        const runner = queryMap[metric];
        if (!runner) return { intent, reply: `Analytics metric "${metric}" not recognized.` };
        const rawData = await runner(vendorId, timeframe) as Record<string, unknown>;
        const total = rawData.totalRevenue || rawData.totalBookings || rawData.totalUsers || 0;
        const label = metric.replace(/_/g, " ");
        return {
          intent,
          reply: `${label} (${timeframe}): Data retrieved. Key figure: ${typeof total === "number" ? total : JSON.stringify(total)}. For detailed charts, use the analytics dashboard.`,
        };
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/database|db|prisma|ECONNREFUSED|getaddrinfo/i.test(msg)) {
      return { intent, reply: "I can answer general questions, but detailed data queries are unavailable right now because the database is not connected." };
    }
    return { intent, reply: `I encountered an issue while processing your request. Please try again.` };
  }
}
