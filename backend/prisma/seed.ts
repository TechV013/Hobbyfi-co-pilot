import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

const prisma = new PrismaClient();

function uuid() {
  return crypto.randomUUID();
}

async function main() {
  console.log("Seeding database...");

  const vendor1Id = "vendor-a-0001-0000-0000-000000000001";
  const vendor2Id = "vendor-b-0002-0000-0000-000000000002";

  // Idempotent: clean existing data
  await prisma.$transaction([
    prisma.auditLog.deleteMany({ where: { vendorId: { in: [vendor1Id, vendor2Id] } } }),
    prisma.pendingApproval.deleteMany({ where: { vendorId: { in: [vendor1Id, vendor2Id] } } }),
    prisma.payment.deleteMany({ where: { vendorId: { in: [vendor1Id, vendor2Id] } } }),
    prisma.booking.deleteMany({ where: { vendorId: { in: [vendor1Id, vendor2Id] } } }),
    prisma.revenue.deleteMany({ where: { vendorId: { in: [vendor1Id, vendor2Id] } } }),
    prisma.user.deleteMany({ where: { vendorId: { in: [vendor1Id, vendor2Id] } } }),
    prisma.vendorPreference.deleteMany({ where: { vendorId: { in: [vendor1Id, vendor2Id] } } }),
    prisma.vendor.deleteMany({ where: { id: { in: [vendor1Id, vendor2Id] } } }),
  ]);

  const vendor1 = await prisma.vendor.create({
    data: {
      id: vendor1Id,
      name: "Rahul Sharma",
      academyName: "Sharma Sports Academy",
      city: "Mumbai",
      sportsOffered: "cricket,football,badminton",
      subscriptionPlan: "premium",
    },
  });

  const vendor2 = await prisma.vendor.create({
    data: {
      id: vendor2Id,
      name: "Priya Patel",
      academyName: "Patel Fitness Hub",
      city: "Delhi",
      sportsOffered: "swimming,yoga,football",
      subscriptionPlan: "basic",
    },
  });

  const usersV1 = [
    { name: "Amit Kumar", phone: "9876543210", sport: "cricket", membershipType: "monthly", trialStatus: false, coachAssigned: "Rahul" },
    { name: "Sneha Reddy", phone: "9876543211", sport: "badminton", membershipType: "quarterly", trialStatus: false },
    { name: "Rahul Verma", phone: "9876543212", sport: "cricket", membershipType: "trial", trialStatus: true },
    { name: "Priya Singh", phone: "9876543213", sport: "football", membershipType: "annual", trialStatus: false },
    { name: "Rohit Joshi", phone: "9876543214", sport: "cricket", membershipType: "monthly", trialStatus: false },
    { name: "Ananya Gupta", phone: "9876543215", sport: "badminton", membershipType: "trial", trialStatus: true },
    { name: "Vikram Patel", phone: "9876543216", sport: "football", membershipType: "monthly", trialStatus: false },
    { name: "Neha Sharma", phone: "9876543217", sport: "cricket", membershipType: "quarterly", trialStatus: false },
    { name: "Arjun Nair", phone: "9876543218", sport: "badminton", membershipType: "monthly", trialStatus: false },
    { name: "Kavita Das", phone: "9876543219", sport: "football", membershipType: "trial", trialStatus: true },
    { name: "Manish Tiwari", phone: "9876543220", sport: "cricket", membershipType: "annual", trialStatus: false },
    { name: "Pooja Mehta", phone: "9876543221", sport: "football", membershipType: "monthly", trialStatus: false },
    { name: "Suresh Yadav", phone: "9876543222", sport: "badminton", membershipType: "quarterly", trialStatus: false },
    { name: "Divya Kapoor", phone: "9876543223", sport: "cricket", membershipType: "trial", trialStatus: true },
    { name: "Ravi Desai", phone: "9876543224", sport: "football", membershipType: "monthly", trialStatus: false },
  ];

  const usersV2 = [
    { name: "Rajesh Kumar", phone: "9988776651", sport: "swimming", membershipType: "monthly", trialStatus: false },
    { name: "Sara Khan", phone: "9988776652", sport: "yoga", membershipType: "quarterly", trialStatus: false },
    { name: "Mohit Agarwal", phone: "9988776653", sport: "football", membershipType: "trial", trialStatus: true },
    { name: "Anjali Bose", phone: "9988776654", sport: "swimming", membershipType: "annual", trialStatus: false },
    { name: "Karan Malhotra", phone: "9988776655", sport: "yoga", membershipType: "monthly", trialStatus: false },
    { name: "Ishita Jain", phone: "9988776656", sport: "football", membershipType: "trial", trialStatus: true },
    { name: "Aryan Thakur", phone: "9988776657", sport: "swimming", membershipType: "quarterly", trialStatus: false },
    { name: "Nandini Rao", phone: "9988776658", sport: "yoga", membershipType: "monthly", trialStatus: false },
    { name: "Gaurav Saxena", phone: "9988776659", sport: "football", membershipType: "trial", trialStatus: true },
    { name: "Tanya Chopra", phone: "9988776660", sport: "swimming", membershipType: "annual", trialStatus: false },
    { name: "Harsh Vardhan", phone: "9988776661", sport: "yoga", membershipType: "monthly", trialStatus: false },
    { name: "Meera Iyer", phone: "9988776662", sport: "football", membershipType: "quarterly", trialStatus: false },
    { name: "Rohan Bhat", phone: "9988776663", sport: "swimming", membershipType: "trial", trialStatus: true },
    { name: "Simran Kaur", phone: "9988776664", sport: "yoga", membershipType: "monthly", trialStatus: false },
    { name: "Aditya Roy", phone: "9988776665", sport: "football", membershipType: "monthly", trialStatus: false },
  ];

  const now = new Date();
  const baseStart = new Date(now);
  baseStart.setMonth(baseStart.getMonth() - 2);

  const createdUsersV1 = await Promise.all(
    usersV1.map((u, i) => {
      const start = new Date(baseStart);
      start.setDate(start.getDate() + i * 3);
      const end = new Date(start);
      if (u.membershipType === "trial") end.setDate(end.getDate() + 14);
      else if (u.membershipType === "monthly") end.setMonth(end.getMonth() + 1);
      else if (u.membershipType === "quarterly") end.setMonth(end.getMonth() + 3);
      else end.setFullYear(end.getFullYear() + 1);

      return prisma.user.create({
        data: {
          id: uuid(),
          vendorId: vendor1Id,
          name: u.name,
          phone: u.phone,
          sport: u.sport,
          membershipType: u.membershipType,
          membershipStart: start,
          membershipEnd: end,
          trialStatus: u.trialStatus,
          coachAssigned: u.coachAssigned,
        },
      });
    })
  );

  const createdUsersV2 = await Promise.all(
    usersV2.map((u, i) => {
      const start = new Date(baseStart);
      start.setDate(start.getDate() + i * 3);
      const end = new Date(start);
      if (u.membershipType === "trial") end.setDate(end.getDate() + 14);
      else if (u.membershipType === "monthly") end.setMonth(end.getMonth() + 1);
      else if (u.membershipType === "quarterly") end.setMonth(end.getMonth() + 3);
      else end.setFullYear(end.getFullYear() + 1);

      return prisma.user.create({
        data: {
          id: uuid(),
          vendorId: vendor2Id,
          name: u.name,
          phone: u.phone,
          sport: u.sport,
          membershipType: u.membershipType,
          membershipStart: start,
          membershipEnd: end,
          trialStatus: u.trialStatus,
        },
      });
    })
  );

  const slots = ["07:00-08:00", "08:00-09:00", "17:00-18:00", "18:00-19:00", "19:00-20:00"];
  for (let d = 0; d < 7; d++) {
    for (let s = 0; s < slots.length; s++) {
      const date = new Date(now);
      date.setDate(date.getDate() + d);
      const userV1 = createdUsersV1[d % createdUsersV1.length];
      const userV2 = createdUsersV2[d % createdUsersV2.length];

      if (d < 5) {
        await prisma.booking.create({
          data: {
            id: uuid(),
            vendorId: vendor1Id,
            userId: userV1.id,
            sport: userV1.sport,
            slot: slots[s],
            date,
            status: d < 3 ? "confirmed" : "completed",
          },
        });
      }
      if (d < 4) {
        await prisma.booking.create({
          data: {
            id: uuid(),
            vendorId: vendor2Id,
            userId: userV2.id,
            sport: userV2.sport,
            slot: slots[(s + 2) % slots.length],
            date,
            status: d < 2 ? "confirmed" : "completed",
          },
        });
      }
    }
  }

  for (let i = 0; i < 15; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const onlineRev = Math.floor(Math.random() * 5000) + 1000;
    const offlineRev = Math.floor(Math.random() * 3000) + 500;

    await prisma.revenue.create({
      data: {
        id: uuid(),
        vendorId: vendor1Id,
        date,
        onlineRevenue: onlineRev,
        offlineRevenue: offlineRev,
        totalRevenue: onlineRev + offlineRev,
      },
    });

    const onlineRev2 = Math.floor(Math.random() * 3000) + 500;
    const offlineRev2 = Math.floor(Math.random() * 2000) + 300;
    await prisma.revenue.create({
      data: {
        id: uuid(),
        vendorId: vendor2Id,
        date,
        onlineRevenue: onlineRev2,
        offlineRevenue: offlineRev2,
        totalRevenue: onlineRev2 + offlineRev2,
      },
    });
  }

  for (let i = 0; i < 12; i++) {
    const userV1 = createdUsersV1[i % createdUsersV1.length];
    const userV2 = createdUsersV2[i % createdUsersV2.length];

    await prisma.payment.create({
      data: {
        id: uuid(),
        vendorId: vendor1Id,
        userId: userV1.id,
        amount: Math.floor(Math.random() * 2000) + 500,
        method: i % 3 === 0 ? "online" : "offline",
        status: i < 10 ? "success" : "pending",
        paidAt: i < 10 ? new Date() : null,
      },
    });

    await prisma.payment.create({
      data: {
        id: uuid(),
        vendorId: vendor2Id,
        userId: userV2.id,
        amount: Math.floor(Math.random() * 1500) + 300,
        method: i % 2 === 0 ? "online" : "offline",
        status: i < 9 ? "success" : "pending",
        paidAt: i < 9 ? new Date() : null,
      },
    });
  }

  console.log("Seed complete!");
  console.log(`  Vendor 1: ${createdUsersV1.length} users, bookings, revenue & payments`);
  console.log(`  Vendor 2: ${createdUsersV2.length} users, bookings, revenue & payments`);
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
