import { type AnalyticsOutput } from "./types";
import { logger } from "../lib/logger";

const METRIC_LABELS: Record<string, string> = {
  revenue_analysis: "Revenue Analysis",
  booking_trends: "Booking Trends",
  trial_conversion: "Trial Conversion",
  membership_growth: "Membership Growth",
  coach_performance: "Coach Performance",
  peak_hours: "Peak Hours Analysis",
  cancellation_rate: "Cancellation Rate",
  payment_success_rate: "Payment Success Rate",
};

function buildFallbackOutput(
  metric: string,
  timeframe: string,
  rawData: unknown,
): AnalyticsOutput {
  const data = rawData as Record<string, unknown>;
  return {
    metric,
    timeframe,
    summary: `Analysis for ${METRIC_LABELS[metric] || metric} over ${timeframe}.`,
    insights: ["Data retrieved successfully."],
    recommendations: [],
    charts: [],
    kpis: Object.entries(data).slice(0, 5).map(([key, value]) => ({
      label: key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()),
      value: typeof value === "number" ? String(Math.round(value * 100) / 100) : String(value),
    })),
  };
}

export async function generateInsights(
  metric: string,
  timeframe: string,
  rawData: unknown,
): Promise<AnalyticsOutput> {
  try {
    return buildFallbackOutput(metric, timeframe, rawData);
  } catch (err) {
    logger.warn("Analytics output generation failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return buildFallbackOutput(metric, timeframe, rawData);
  }
}
