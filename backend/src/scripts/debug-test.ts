import { PrismaClient } from "@prisma/client";

async function main() {
  const p = new PrismaClient();

  const users = await p.user.findMany({
    where: { vendorId: "vendor-a-0001-0000-0000-000000000001", trialStatus: true },
  });

  console.log("Direct DB trial query:", users.length);
  users.forEach((u) => console.log(`  ${u.name} (${u.membershipType}) trial=${u.trialStatus}`));

  // Also test via repo
  const { UserRepository } = await import("../repositories/user.repository");
  const repo = new UserRepository(p);
  const repoUsers = await repo.search("vendor-a-0001-0000-0000-000000000001", { trialOnly: true });
  console.log("\nRepo search trial:", repoUsers.length);
  repoUsers.forEach((u) => console.log(`  ${u.name} (${u.membershipType}) trial=${u.trialStatus}`));

  await p.$disconnect();
}

main().catch(console.error);
