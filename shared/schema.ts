import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Analysis history table — stores past card analyses
export const analyses = pgTable("analyses", {
  id: serial("id").primaryKey(),
  imageUrl: text("image_url").notNull(),
  sport: text("sport").notNull(),
  playerName: text("player_name").notNull(),
  playerTier: text("player_tier").notNull(),
  brandTier: text("brand_tier").notNull(),
  setName: text("set_name"),
  year: text("year"),
  printRun: text("print_run").notNull(),
  grader: text("grader").notNull(),
  grade: text("grade").notNull(),
  autoType: text("auto_type").notNull(),
  isRookie: boolean("is_rookie").notNull(),
  serialNumber: text("serial_number"),
  playerJersey: text("player_jersey"),
  baseCardValue: integer("base_card_value").notNull(),
  estimatedFmv: integer("estimated_fmv").notNull(),
  confidence: text("confidence").notNull(),
  aiRawResponse: text("ai_raw_response"),
  folderId: integer("folder_id"),
  userId: integer("user_id"),
  createdAt: text("created_at").notNull(),
});

export const insertAnalysisSchema = createInsertSchema(analyses).omit({
  id: true,
});

export type InsertAnalysis = z.infer<typeof insertAnalysisSchema>;
export type Analysis = typeof analyses.$inferSelect;

// Users table — authentication & subscription
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email"),
  isAdmin: boolean("is_admin").default(false),
  tier: text("tier").notNull().default("free"), // free | pro | elite | enterprise
  tierExpiresAt: text("tier_expires_at"), // ISO date, null = no expiry (free or lifetime)
  totalScans: integer("total_scans").notNull().default(0),
  monthlyScans: integer("monthly_scans").notNull().default(0),
  monthlyScansResetAt: text("monthly_scans_reset_at"),
  createdAt: text("created_at").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  email: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Folders table — organize analyses into collections
export const folders = pgTable("folders", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color").default("#1e3a5f"), // navy default
  icon: text("icon").default("folder"), // lucide icon name
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertFolderSchema = createInsertSchema(folders).omit({
  id: true,
});

export type InsertFolder = z.infer<typeof insertFolderSchema>;
export type Folder = typeof folders.$inferSelect;

// Subscriptions table — payment records
export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  tier: text("tier").notNull(), // pro | elite | enterprise
  btcTxId: text("btc_tx_id"), // bitcoin transaction hash
  btcAmount: text("btc_amount"), // BTC amount sent
  usdAmount: text("usd_amount"), // USD equivalent
  promoCodeUsed: text("promo_code_used"),
  status: text("status").notNull().default("pending"), // pending | confirmed | expired | cancelled
  startsAt: text("starts_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
});

export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({
  id: true,
});

export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Subscription = typeof subscriptions.$inferSelect;

// Promo codes table — admin-created discount/access codes
export const promoCodes = pgTable("promo_codes", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  description: text("description"), // admin note about purpose
  discountType: text("discount_type").notNull(), // percentage | fixed | free_tier | free_trial
  discountValue: integer("discount_value").notNull(), // percentage (0-100) or cents off or days free
  applicableTiers: text("applicable_tiers").notNull().default("pro,elite,enterprise"), // comma-sep
  maxUses: integer("max_uses"), // null = unlimited
  currentUses: integer("current_uses").notNull().default(0),
  grantsTier: text("grants_tier"), // if free_tier type, which tier to grant
  grantsDays: integer("grants_days"), // how many days the promo grants
  isActive: boolean("is_active").notNull().default(true),
  expiresAt: text("expires_at"), // null = never expires
  createdBy: integer("created_by").notNull(), // admin user id
  createdAt: text("created_at").notNull(),
});

export const insertPromoCodeSchema = createInsertSchema(promoCodes).omit({
  id: true,
});

export type InsertPromoCode = z.infer<typeof insertPromoCodeSchema>;
export type PromoCode = typeof promoCodes.$inferSelect;

// Promo code redemptions — track who used what
export const promoRedemptions = pgTable("promo_redemptions", {
  id: serial("id").primaryKey(),
  promoCodeId: integer("promo_code_id").notNull(),
  userId: integer("user_id").notNull(),
  redeemedAt: text("redeemed_at").notNull(),
});

export const insertPromoRedemptionSchema = createInsertSchema(promoRedemptions).omit({
  id: true,
});

export type InsertPromoRedemption = z.infer<typeof insertPromoRedemptionSchema>;
export type PromoRedemption = typeof promoRedemptions.$inferSelect;

// ============== Tier definitions (used by frontend + backend) ==============
export const TIERS = {
  free: {
    name: "Free",
    price: 0,
    monthlyScans: 10,
    maxHistory: 25,
    folders: 0,
    features: [
      "10 AI scans per month",
      "Full valuation engine",
      "Grading recommendations",
      "Selling platform advice",
      "25 history entries",
    ],
    limitations: [
      "No folders / collections",
      "No bulk export",
      "No priority AI model",
    ],
  },
  pro: {
    name: "Pro",
    price: 4.99,
    monthlyScans: 100,
    maxHistory: 500,
    folders: 10,
    features: [
      "100 AI scans per month",
      "Full valuation engine",
      "Grading recommendations",
      "Selling platform advice",
      "500 history entries",
      "10 custom folders",
      "CSV export",
      "Priority support",
    ],
    limitations: [
      "No unlimited folders",
      "No API access",
    ],
  },
  elite: {
    name: "Elite",
    price: 12.99,
    monthlyScans: 500,
    maxHistory: 5000,
    folders: 50,
    features: [
      "500 AI scans per month",
      "Full valuation engine",
      "Grading recommendations",
      "Selling platform advice",
      "5,000 history entries",
      "50 custom folders",
      "CSV + PDF export",
      "Bulk scan mode",
      "Priority AI model",
      "Market trend alerts",
    ],
    limitations: [
      "No unlimited scans",
    ],
  },
  enterprise: {
    name: "Enterprise",
    price: 29.99,
    monthlyScans: -1, // unlimited
    maxHistory: -1, // unlimited
    folders: -1, // unlimited
    features: [
      "Unlimited AI scans",
      "Full valuation engine",
      "Grading recommendations",
      "Selling platform advice",
      "Unlimited history",
      "Unlimited folders",
      "CSV + PDF + JSON export",
      "Bulk scan mode",
      "Priority AI model",
      "Market trend alerts",
      "API access",
      "White-label reports",
      "Dedicated support",
    ],
    limitations: [],
  },
} as const;

export type TierKey = keyof typeof TIERS;

// BTC wallet for payments
export const BTC_WALLET = "3JmWA5vVpByAx9V6zCFWdLNv5Q1yfueAw1";
