import { createTool } from "@mastra/core/tools";
import { AnalyticsQueryInput } from "./types";
import {
  queryRevenue,
  queryBookingTrends,
  queryTrialConversion,
  queryMembershipGrowth,
  queryCoachPerformance,
  queryPeakHours,
  queryCancellationRate,
  queryPaymentSuccessRate,
} from "./queries";
import { generateInsights } from "./insights";

export {
  queryRevenue,
  queryBookingTrends,
  queryTrialConversion,
  queryMembershipGrowth,
  queryCoachPerformance,
  queryPeakHours,
  queryCancellationRate,
  queryPaymentSuccessRate,
};

const QUERY_ROUTER: Record<
  string,
  (vendorId: string, timeframe: string, sport?: string) => Promise<Record<string, unknown>>
> = {
  revenue_analysis: async (vendorId, timeframe) =>
    (await queryRevenue(vendorId, timeframe)) as unknown as Record<string, unknown>,
  booking_trends: async (vendorId, timeframe, sport) =>
    (await queryBookingTrends(vendorId, timeframe, sport)) as unknown as Record<string, unknown>,
  trial_conversion: async (vendorId) =>
    (await queryTrialConversion(vendorId)) as unknown as Record<string, unknown>,
  membership_growth: async (vendorId, timeframe) =>
    (await queryMembershipGrowth(vendorId, timeframe)) as unknown as Record<string, unknown>,
  coach_performance: async (vendorId) =>
    (await queryCoachPerformance(vendorId)) as unknown as Record<string, unknown>,
  peak_hours: async (vendorId, timeframe) =>
    (await queryPeakHours(vendorId, timeframe)) as unknown as Record<string, unknown>,
  cancellation_rate: async (vendorId, timeframe) =>
    (await queryCancellationRate(vendorId, timeframe)) as unknown as Record<string, unknown>,
  payment_success_rate: async (vendorId, timeframe) =>
    (await queryPaymentSuccessRate(vendorId, timeframe)) as unknown as Record<string, unknown>,
};

export const analyticsTool = createTool({
  id: "analytics.query",
  description: `Query business analytics and insights for the vendor's academy.
Generates AI-powered analysis with summary, insights, recommendations, chart-ready data, and KPIs.
Metrics:
- revenue_analysis: Revenue trends, online vs offline breakdown, period comparisons
- booking_trends: Booking volumes, daily trends, sport-wise breakdown
- trial_conversion: Trial-to-paid conversion rates
- membership_growth: New members over time, membership type distribution
- coach_performance: Member distribution per coach
- peak_hours: Busiest booking slots and their utilization
- cancellation_rate: Overall and sport-wise cancellation rates
- payment_success_rate: Payment success rates by method and status

Use the 'this_month' or '30d' timeframe for current overview. Use '7d' for recent trends.
Examples: "Analyze revenue trends", "Show booking patterns", "How are my trials converting?", "Which coach has the most members?"`,
  inputSchema: AnalyticsQueryInput,
  execute: async (
    inputData: { metric: string; timeframe: string; sport?: string },
    { requestContext },
  ) => {
    const vendorId = requestContext?.get("vendorId") as string;
    const runner = QUERY_ROUTER[inputData.metric];

    const rawData = await runner(vendorId, inputData.timeframe, inputData.sport);

    const analysis = await generateInsights(inputData.metric, inputData.timeframe, rawData);

    return {
      ...analysis,
      rawData,
    };
  },
});
