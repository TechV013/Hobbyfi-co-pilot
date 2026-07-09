import { PrismaClient, Prisma } from "@prisma/client";

export interface RevenueQueryFilters {
  startDate?: string;
  endDate?: string;
}

export class RevenueRepository {
  constructor(private prisma: PrismaClient) {}

  async query(vendorId: string, filters: RevenueQueryFilters) {
    const where: Prisma.RevenueWhereInput = { vendorId };

    if (filters.startDate || filters.endDate) {
      const dateFilter: Prisma.DateTimeFilter = {};
      if (filters.startDate) dateFilter.gte = new Date(filters.startDate);
      if (filters.endDate) dateFilter.lte = new Date(filters.endDate);

      if (filters.startDate && filters.endDate && new Date(filters.startDate) > new Date(filters.endDate)) {
        console.warn(`Revenue query warning: startDate (${filters.startDate}) > endDate (${filters.endDate})`);
      }

      where.date = dateFilter;
    }

    return this.prisma.revenue.findMany({
      where,
      orderBy: { date: "asc" },
    });
  }
}
