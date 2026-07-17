import { z } from "zod";

export const RevenueQueryInput = z.object({
  range: z.enum(["today", "yesterday", "this_week", "this_month"]).default("this_month"),
});

export const UserSearchInput = z.object({
  sport: z.string().optional(),
  membershipType: z.string().optional(),
  trialOnly: z.boolean().optional(),
  expiringWithinDays: z.number().int().positive().optional(),
  nameOrPhoneQuery: z.string().optional(),
  coachAssigned: z.string().optional(),
});

export const BookingQueryInput = z.object({
  sport: z.string().optional(),
  status: z.string().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  limit: z.number().int().positive().max(100).default(20),
});

export const PaymentQueryInput = z.object({
  status: z.string().optional(),
  method: z.string().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  limit: z.number().int().positive().max(100).default(20),
});

export const MembershipUpdateInput = z.object({
  userId: z.string(),
  action: z.enum(["extend_trial", "set_membership_end", "upgrade_plan"]),
  extendByDays: z.number().int().positive().optional(),
  newMembershipEnd: z.string().datetime().optional(),
  newMembershipType: z.string().optional(),
});

export const NotificationSendInput = z.object({
  userIds: z.array(z.string()).min(1).max(10),
  type: z.enum(["payment_reminder", "membership_expiry", "custom"]),
  message: z.string().max(500),
});
