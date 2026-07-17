import { z } from "zod";
import { RevenueRepository } from "../repositories/revenue.repository";
import { RevenueQueryInput } from "./definitions";

export async function revenueQueryTool(
  vendorId: string,
  input: z.infer<typeof RevenueQueryInput>,
  repo: RevenueRepository,
) {
  const now = new Date();
  let startDate: string | undefined;
  let endDate: string | undefined;

  switch (input.range) {
    case "today":
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      endDate = now.toISOString();
      break;
    case "yesterday": {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      startDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate()).toISOString();
      endDate = yesterday.toISOString();
      break;
    }
    case "this_week": {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);
      startDate = weekStart.toISOString();
      endDate = now.toISOString();
      break;
    }
    case "this_month": {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      startDate = monthStart.toISOString();
      endDate = now.toISOString();
      break;
    }
  }

  const records = await repo.query(vendorId, { startDate, endDate });

  const total = records.reduce((sum, r) => sum + Number(r.totalRevenue), 0);
  const online = records.reduce((sum, r) => sum + Number(r.onlineRevenue), 0);
  const offline = records.reduce((sum, r) => sum + Number(r.offlineRevenue), 0);

  return {
    range: input.range,
    totalRevenue: total,
    onlineRevenue: online,
    offlineRevenue: offline,
    recordCount: records.length,
  };
}
