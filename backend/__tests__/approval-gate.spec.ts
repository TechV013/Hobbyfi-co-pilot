import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "./helpers/db";
import { ApprovalEngine } from "../src/approval/approval-engine.service";
import { AuthError, NotFoundError, ConflictError, ExpiredError, ValidationError } from "../src/lib/errors";

const VENDOR_A = "vendor-a-0001-0000-0000-000000000001";
const VENDOR_B = "vendor-b-0002-0000-0000-000000000002";

afterAll(async () => {
  await prisma.pendingApproval.deleteMany({
    where: { conversationId: { startsWith: "vitest-" } },
  });
});

describe("R2 - Approval Gate", () => {
  it("AuthError has 401 status", () => {
    expect(new AuthError().statusCode).toBe(401);
  });

  it("NotFoundError has 404 status", () => {
    expect(new NotFoundError().statusCode).toBe(404);
  });

  it("ConflictError has 409 status", () => {
    expect(new ConflictError().statusCode).toBe(409);
  });

  it("ExpiredError has 410 status", () => {
    expect(new ExpiredError().statusCode).toBe(410);
  });

  it("ValidationError has 400 status", () => {
    expect(new ValidationError("test").statusCode).toBe(400);
  });

  it("Double committing must throw ConflictError", async () => {
    const engine = new ApprovalEngine(prisma);
    const userA = await prisma.user.findFirst({ where: { vendorId: VENDOR_A } });
    expect(userA).not.toBeNull();

    const pending = await prisma.pendingApproval.create({
      data: {
        vendorId: VENDOR_A,
        conversationId: "vitest-double-commit",
        toolName: "membership.update",
        targetTable: "User",
        targetId: userA!.id,
        previousValue: JSON.stringify({}),
        proposedValue: JSON.stringify({ membershipType: "monthly" }),
        expiresAt: new Date(Date.now() + 100_000),
        status: "pending",
      },
    });

    await engine.commit(VENDOR_A, pending.id);
    await expect(engine.commit(VENDOR_A, pending.id)).rejects.toThrow(ConflictError);
    await expect(engine.commit(VENDOR_A, pending.id)).rejects.toThrow(/already been committed/);
  });

  it("Double rejecting must throw ConflictError", async () => {
    const engine = new ApprovalEngine(prisma);
    const userA = await prisma.user.findFirst({ where: { vendorId: VENDOR_A } });
    expect(userA).not.toBeNull();

    const pending = await prisma.pendingApproval.create({
      data: {
        vendorId: VENDOR_A,
        conversationId: "vitest-double-reject",
        toolName: "membership.update",
        targetTable: "User",
        targetId: userA!.id,
        previousValue: JSON.stringify({}),
        proposedValue: JSON.stringify({}),
        expiresAt: new Date(Date.now() + 100_000),
        status: "pending",
      },
    });

    await engine.reject(VENDOR_A, pending.id);
    await expect(engine.reject(VENDOR_A, pending.id)).rejects.toThrow(ConflictError);
    await expect(engine.reject(VENDOR_A, pending.id)).rejects.toThrow(/already been rejected/);
  });

  it("Commit must fail for cross-vendor ownership", async () => {
    const engine = new ApprovalEngine(prisma);
    const userB = await prisma.user.findFirst({ where: { vendorId: VENDOR_B } });
    expect(userB).not.toBeNull();

    const pending = await prisma.pendingApproval.create({
      data: {
        vendorId: VENDOR_A,
        conversationId: "vitest-cross-vendor",
        toolName: "membership.update",
        targetTable: "User",
        targetId: userB!.id,
        previousValue: JSON.stringify({}),
        proposedValue: JSON.stringify({ membershipEnd: new Date(Date.now() + 86_400_000).toISOString() }),
        expiresAt: new Date(Date.now() + 100_000),
        status: "pending",
      },
    });

    await expect(engine.commit(VENDOR_A, pending.id)).rejects.toThrow(NotFoundError);
    await expect(engine.commit(VENDOR_A, pending.id)).rejects.toThrow(/does not exist or does not belong/);
  });

  it("Reject must fail for wrong vendor", async () => {
    const engine = new ApprovalEngine(prisma);
    const userA = await prisma.user.findFirst({ where: { vendorId: VENDOR_A } });
    expect(userA).not.toBeNull();

    const pending = await prisma.pendingApproval.create({
      data: {
        vendorId: VENDOR_A,
        conversationId: "vitest-wrong-vendor-reject",
        toolName: "membership.update",
        targetTable: "User",
        targetId: userA!.id,
        previousValue: JSON.stringify({}),
        proposedValue: JSON.stringify({}),
        expiresAt: new Date(Date.now() + 100_000),
        status: "pending",
      },
    });

    await expect(engine.reject(VENDOR_B, pending.id)).rejects.toThrow(NotFoundError);
  });

  it("Commit must fail for non-existent previewId", async () => {
    const engine = new ApprovalEngine(prisma);
    await expect(engine.commit(VENDOR_A, "00000000-0000-0000-0000-000000000000")).rejects.toThrow(NotFoundError);
  });
});
