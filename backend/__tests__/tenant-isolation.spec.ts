import { describe, it, expect } from "vitest";
import { prisma } from "./helpers/db";
import { UserRepository } from "../src/repositories/user.repository";
import { RevenueRepository } from "../src/repositories/revenue.repository";

const VENDOR_A = "vendor-a-0001-0000-0000-000000000001";
const VENDOR_B = "vendor-b-0002-0000-0000-000000000002";

describe("R1 - Tenant Isolation", () => {
  it("Vendor A must not find Vendor B users by ID", async () => {
    const userRepo = new UserRepository(prisma);
    const userB = await prisma.user.findFirst({ where: { vendorId: VENDOR_B } });
    expect(userB).not.toBeNull();

    const result = await userRepo.findById(VENDOR_A, userB!.id);
    expect(result).toBeNull();
  });

  it("Vendor A search must not return Vendor B users", async () => {
    const userRepo = new UserRepository(prisma);
    const results = await userRepo.search(VENDOR_A, {});
    const hasVendorBUser = results.some((u) => u.vendorId === VENDOR_B);
    expect(hasVendorBUser).toBe(false);
  });

  it("Revenue query must only return vendor's own data", async () => {
    const revenueRepo = new RevenueRepository(prisma);
    const results = await revenueRepo.query(VENDOR_A, { range: "today" });
    const hasVendorBData = results.some((r) => r.vendorId === VENDOR_B);
    expect(hasVendorBData).toBe(false);
  });

  it("Vendor B must not find Vendor A users", async () => {
    const userRepo = new UserRepository(prisma);
    const userA = await prisma.user.findFirst({ where: { vendorId: VENDOR_A } });
    expect(userA).not.toBeNull();

    const result = await userRepo.findById(VENDOR_B, userA!.id);
    expect(result).toBeNull();
  });
});
