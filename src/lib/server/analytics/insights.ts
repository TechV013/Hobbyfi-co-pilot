import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { AnalyticsOutputSchema, type AnalyticsOutput } from "./types";
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

const MODEL = process.env.LLM_MODEL || "gemini-2.0-flash";

function buildPrompt(metric: string, timeframe: string, rawData: unknown): string {
  const metricName = METRIC_LABELS[metric] || metric;
  return `You are an analytics expert for a sports academy management platform called HobbyFi.
A vendor has requested a ${metricName} report for the timeframe "${timeframe}".

Below is the raw data from the database. Analyze it and provide:

1. **summary** — A concise 2-3 sentence executive summary of the key findings.
2. **insights** — 3-5 specific, data-backed insights about what the numbers mean.
3. **recommendations** — 2-3 actionable recommendations the vendor can take to improve.
4. **charts** — Chart-ready data arrays. Each chart has a type (bar, line, pie), title, labels array, and datasets array with label + values.
5. **kpis** — 3-5 key business KPIs with label, value string, optional change percentage string, and trend direction (up/down/neutral).

Raw data:
${JSON.stringify(rawData, null, 2)}

Return ONLY valid JSON matching the requested schema. Use Indian Rupee symbol (₹) for monetary values.`;
}

function buildFallbackOutput(
  metric: string,
  timeframe: string,
  rawData: Record<string, unknown>,
): AnalyticsOutput {
  return {
    metric,
    timeframe,
    summary: `Analysis for ${METRIC_LABELS[metric] || metric} over ${timeframe}.`,
    insights: ["Data retrieved successfully. LLM-enhanced analysis unavailable — review the raw data below."],
    recommendations: ["Enable LLM reasoning by ensuring your API key has sufficient quota."],
    charts: [],
    kpis: Object.entries(rawData).slice(0, 5).map(([key, value]) => ({
      label: key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()),
      value: typeof value === "number" ? String(Math.round(value * 100) / 100) : String(value),
    })),
  };
}

export async function generateInsights(
  metric: string,
  timeframe: string,
  rawData: Record<string, unknown>,
): Promise<AnalyticsOutput> {
  try {
    const prompt = buildPrompt(metric, timeframe, rawData);

    const { object } = await generateObject({
      model: google(MODEL),
      schema: AnalyticsOutputSchema,
      prompt,
      temperature: 0.3,
    });

    return {
      metric,
      timeframe,
      summary: object.summary,
      insights: object.insights,
      recommendations: object.recommendations,
      charts: object.charts,
      kpis: object.kpis,
    };
  } catch (err) {
    logger.warn("LLM insight generation failed, returning raw data analysis", {
      error: err instanceof Error ? err.message : String(err),
    });
    return buildFallbackOutput(metric, timeframe, rawData);
  }
}
