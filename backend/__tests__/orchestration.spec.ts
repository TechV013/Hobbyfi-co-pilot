import { describe, it, expect } from "vitest";
import { prisma } from "./helpers/db";
import { UserRepository } from "../src/repositories/user.repository";
import { RevenueRepository } from "../src/repositories/revenue.repository";

const VENDOR_A = "vendor-a-0001-0000-0000-000000000001";

describe("Tool execution", () => {
  it("userSearch with trialOnly returns only trial status users", async () => {
    const userRepo = new UserRepository(prisma);
    const userSearchTool = (await import("../src/tools/user.search")).userSearchTool;

    const result = await userSearchTool(VENDOR_A, { trialOnly: true }, userRepo);
    expect(result.count).toBeGreaterThan(0);
    expect(result.users.every((u: { trialStatus: boolean }) => u.trialStatus)).toBe(true);
  });

  it("userSearch with sport filter returns only matching sport", async () => {
    const userRepo = new UserRepository(prisma);
    const userSearchTool = (await import("../src/tools/user.search")).userSearchTool;

    const result = await userSearchTool(VENDOR_A, { sport: "cricket" }, userRepo);
    expect(result.count).toBeGreaterThan(0);
    expect(result.users.every((u: { sport: string }) => u.sport === "cricket")).toBe(true);
  });

  it("userSearch with name query finds matching user", async () => {
    const userRepo = new UserRepository(prisma);
    const userSearchTool = (await import("../src/tools/user.search")).userSearchTool;

    const result = await userSearchTool(VENDOR_A, { nameOrPhoneQuery: "Amit" }, userRepo);
    expect(result.count).toBeGreaterThanOrEqual(1);
    expect(result.users.some((u: { name: string }) => u.name.includes("Amit"))).toBe(true);
  });

  it("revenueQuery returns data for today", async () => {
    const revenueRepo = new RevenueRepository(prisma);
    const revenueQueryTool = (await import("../src/tools/revenue.query")).revenueQueryTool;

    const result = await revenueQueryTool(VENDOR_A, { range: "today" }, revenueRepo);
    expect(result).toHaveProperty("totalRevenue");
    expect(result).toHaveProperty("onlineRevenue");
    expect(result).toHaveProperty("offlineRevenue");
    expect(result.totalRevenue).toBeGreaterThanOrEqual(0);
  });

  it("revenueQuery returns data for this_week", async () => {
    const revenueRepo = new RevenueRepository(prisma);
    const revenueQueryTool = (await import("../src/tools/revenue.query")).revenueQueryTool;

    const result = await revenueQueryTool(VENDOR_A, { range: "this_week" }, revenueRepo);
    expect(result.totalRevenue).toBeGreaterThanOrEqual(0);
  });
});
