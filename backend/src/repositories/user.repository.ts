import { PrismaClient, User, Prisma } from "@prisma/client";

export interface UserSearchFilters {
  sport?: string;
  membershipType?: string;
  trialOnly?: boolean;
  expiringWithinDays?: number;
  nameOrPhoneQuery?: string;
  limit?: number;
}

export class UserRepository {
  constructor(private prisma: PrismaClient) {}

  async search(vendorId: string, filters: UserSearchFilters): Promise<User[]> {
    const where: Prisma.UserWhereInput = { vendorId };

    if (filters.sport) {
      where.sport = filters.sport;
    }
    if (filters.membershipType) {
      where.membershipType = filters.membershipType;
    }
    if (filters.trialOnly) {
      where.trialStatus = true;
    }
    if (filters.expiringWithinDays) {
      const now = new Date();
      const threshold = new Date();
      threshold.setDate(threshold.getDate() + filters.expiringWithinDays);
      where.membershipEnd = { gte: now, lte: threshold };
    }
    if (filters.nameOrPhoneQuery) {
      // Note: `contains` with `mode: 'insensitive'` is PG-only; on SQLite it's ignored
      where.OR = [{ name: { contains: filters.nameOrPhoneQuery } }, { phone: { contains: filters.nameOrPhoneQuery } }];
    }

    return this.prisma.user.findMany({
      where,
      take: filters.limit ?? 20,
      orderBy: { name: "asc" },
    });
  }

  async findById(vendorId: string, id: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { id, vendorId },
    });
  }
}
