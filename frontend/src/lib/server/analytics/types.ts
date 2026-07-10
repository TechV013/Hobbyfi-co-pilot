import { z } from "zod";

export const AnalyticsMetric = z.enum([
  "revenue_analysis",
  "booking_trends",
  "trial_conversion",
  "membership_growth",
  "coach_performance",
  "peak_hours",
  "cancellation_rate",
  "payment_success_rate",
]);

export const AnalyticsTimeframe = z.enum(["7d", "30d", "90d", "this_month", "last_month"]);

export const AnalyticsQueryInput = z.object({
  metric: AnalyticsMetric,
  timeframe: AnalyticsTimeframe,
  sport: z.string().optional(),
});

const ChartDataSchema = z.object({
  type: z.enum(["bar", "line", "pie"]),
  title: z.string(),
  labels: z.array(z.string()),
  datasets: z.array(
    z.object({
      label: z.string(),
      values: z.array(z.number()),
    }),
  ),
});

const KpiSchema = z.object({
  label: z.string(),
  value: z.string(),
  change: z.string().optional(),
  trend: z.enum(["up", "down", "neutral"]).optional(),
});

export const AnalyticsOutputSchema = z.object({
  metric: z.string(),
  timeframe: z.string(),
  summary: z.string(),
  insights: z.array(z.string()),
  recommendations: z.array(z.string()),
  charts: z.array(ChartDataSchema),
  kpis: z.array(KpiSchema),
});

export type AnalyticsMetricType = z.infer<typeof AnalyticsMetric>;
export type AnalyticsTimeframeType = z.infer<typeof AnalyticsTimeframe>;
export type AnalyticsQueryInputType = z.infer<typeof AnalyticsQueryInput>;
export type AnalyticsOutput = z.infer<typeof AnalyticsOutputSchema>;
