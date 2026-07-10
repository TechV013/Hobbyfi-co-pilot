import { prisma } from "../db";
import type { IVendorMemory, VendorPreferences } from "./types";

const DEFAULT_PREFERENCES: VendorPreferences = {
  favoriteReports: [],
  frequentlyUsedFilters: {},
  preferredLanguage: "en",
  timezone: "Asia/Kolkata",
};

export class PostgresVendorMemory implements IVendorMemory {
  async getPreferences(vendorId: string): Promise<VendorPreferences> {
    const prefs = await prisma.vendorPreference.findUnique({ where: { vendorId } });
    if (!prefs) return { ...DEFAULT_PREFERENCES };

    return {
      favoriteReports: this.parseJsonArray(prefs.favoriteReports),
      defaultSportFilter: prefs.defaultSportFilter ?? undefined,
      frequentlyUsedFilters: this.parseJsonRecord(prefs.frequentlyUsedFilters),
      preferredLanguage: prefs.preferredLanguage ?? "en",
      timezone: prefs.timezone ?? "Asia/Kolkata",
    };
  }

  async updatePreferences(vendorId: string, prefs: Partial<VendorPreferences>): Promise<void> {
    const updateData: Record<string, unknown> = {};

    if (prefs.favoriteReports !== undefined) {
      updateData.favoriteReports = JSON.stringify(prefs.favoriteReports);
    }
    if (prefs.defaultSportFilter !== undefined) {
      updateData.defaultSportFilter = prefs.defaultSportFilter;
    }
    if (prefs.frequentlyUsedFilters !== undefined) {
      updateData.frequentlyUsedFilters = JSON.stringify(prefs.frequentlyUsedFilters);
    }
    if (prefs.preferredLanguage !== undefined) {
      updateData.preferredLanguage = prefs.preferredLanguage;
    }
    if (prefs.timezone !== undefined) {
      updateData.timezone = prefs.timezone;
    }

    await prisma.vendorPreference.upsert({
      where: { vendorId },
      create: { vendor: { connect: { id: vendorId } }, ...updateData } as any,
      update: updateData,
    });
  }

  private parseJsonArray(value: string): string[] {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private parseJsonRecord(value: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === "object" && parsed !== null ? parsed : {};
    } catch {
      return {};
    }
  }
}
