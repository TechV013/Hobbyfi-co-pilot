import { generateEmbeddings } from "./embeddings";
import { documentStore } from "./document-store";
import { logger } from "../lib/logger";
import type { NewDocument, DocumentCategory } from "./types";

const SEED_DOCUMENTS: Omit<NewDocument, "vendorId">[] = [
  {
    title: "Monthly Membership Pricing",
    content: "Standard monthly membership is ₹1,500 per sport. Premium membership (all sports access) is ₹3,000 per month. Family packages available at ₹4,500 for up to 4 members.",
    category: "pricing",
  },
  {
    title: "Trial Membership Pricing",
    content: "Trial memberships are free for the first 7 days. After trial period, standard pricing applies.",
    category: "pricing",
  },
  {
    title: "Annual Membership Discount",
    content: "Annual membership offers a 15% discount over monthly pricing. ₹15,300 per year for standard, ₹30,600 for premium.",
    category: "pricing",
  },
  {
    title: "Membership Cancellation Policy",
    content: "Memberships can be cancelled with 30 days written notice. No refund for the current billing period. Annual memberships cancelled before 6 months incur a ₹2,000 early termination fee.",
    category: "membership-policy",
  },
  {
    title: "Trial Cancellation",
    content: "Trial memberships can be cancelled anytime during the trial period at no cost. Simply inform the academy via phone or email.",
    category: "trial-rules",
  },
  {
    title: "Trial Extension Rules",
    content: "Trial periods can be extended by up to 14 additional days at the vendor's discretion. Only one extension per member. Contact support for bulk trial extensions.",
    category: "trial-rules",
  },
  {
    title: "Refund Policy",
    content: "Refunds are processed within 7-10 business days. Session cancellations with more than 24 hours notice are eligible for a full refund. Cancellations within 24 hours are non-refundable.",
    category: "refund-policy",
  },
  {
    title: "Medical Refund Exception",
    content: "In case of medical emergencies with a valid doctor's certificate, a pro-rata refund is provided for unused membership period. Processing time is 5-7 business days.",
    category: "refund-policy",
  },
  {
    title: "Vendor Dashboard Guide",
    content: "The vendor dashboard shows daily revenue, active members, and upcoming renewals. Use the Reports section to download monthly statements. The Members tab lets you search, filter, and manage all registered members.",
    category: "vendor-guide",
  },
  {
    title: "Managing Members",
    content: "Vendors can view member profiles, extend trials, upgrade plans, and send notifications from the member management page. All write operations require approval before taking effect.",
    category: "vendor-guide",
  },
  {
    title: "What sports are available?",
    content: "We offer cricket, football, badminton, swimming, and yoga. Contact your academy for specific sport availability.",
    category: "faq",
  },
  {
    title: "What are the academy timings?",
    content: "Academy is open from 6:00 AM to 10:00 PM, Monday through Saturday. Sundays are open from 7:00 AM to 2:00 PM. Timings may vary by season.",
    category: "faq",
  },
  {
    title: "Can I switch sports mid-month?",
    content: "Yes, you can switch to a different sport at the start of any billing cycle. A ₹200 administration fee applies.",
    category: "faq",
  },
  {
    title: "How do I renew my membership?",
    content: "Memberships auto-renew monthly. You can also renew manually through the academy front desk or by contacting your coach. A reminder is sent 7 days before expiry.",
    category: "faq",
  },
  {
    title: "Required Documents for Registration",
    content: "New members need to submit: 1 passport-size photo, government ID (Aadhaar/PAN/Driving License), address proof, and a signed waiver form. Medical certificate recommended for members above 60.",
    category: "vendor-guide",
  },
  {
    title: "Coach Assignment Process",
    content: "Each member is assigned a dedicated coach based on their sport and skill level. Coach change requests can be made monthly. Elite-level coaching is available at an additional ₹500/month.",
    category: "vendor-guide",
  },
];

export async function ingestSeedDocuments(): Promise<number> {
  logger.info("Ingesting seed documents", { total: SEED_DOCUMENTS.length });

  const docs: NewDocument[] = SEED_DOCUMENTS.map((d) => ({
    title: d.title,
    content: d.content,
    category: d.category as DocumentCategory,
  }));

  const texts = docs.map((d) => `${d.title}\n${d.content}`);

  logger.info("Generating embeddings for seed documents", { count: texts.length });
  const embeddings = await generateEmbeddings(texts);

  await documentStore.insertBatch(docs, embeddings);

  logger.info("Seed documents ingested successfully", { count: docs.length });
  return docs.length;
}
