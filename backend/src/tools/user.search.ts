import { UserRepository } from "../repositories/user.repository";
import { UserSearchInput } from "./definitions";

export async function userSearchTool(vendorId: string, input: z.infer<typeof UserSearchInput>, repo: UserRepository) {
  const users = await repo.search(vendorId, input);

  return {
    count: users.length,
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      phone: u.phone.replace(/.(?=.{4})/g, "*"),
      email: u.email,
      sport: u.sport,
      membershipType: u.membershipType,
      membershipEnd: u.membershipEnd.toISOString(),
      trialStatus: u.trialStatus,
    })),
  };
}
