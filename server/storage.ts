import {
  type User,
  type InsertUser,
  type Analysis,
  type InsertAnalysis,
  type Folder,
  type InsertFolder,
  type Subscription,
  type InsertSubscription,
  type PromoCode,
  type InsertPromoCode,
  type PromoRedemption,
  type InsertPromoRedemption,
  users,
  analyses,
  folders,
  subscriptions,
  promoCodes,
  promoRedemptions,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, desc, and, sql } from "drizzle-orm";

// Postgres connection — Railway provides DATABASE_URL automatically
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL environment variable is required. Set it to your Postgres connection string."
  );
}

const pool = new Pool({
  connectionString: databaseUrl,
  // Railway uses SSL but allows self-signed; local Docker Postgres doesn't need SSL
  ssl: databaseUrl.includes("railway") || databaseUrl.includes("sslmode=require")
    ? { rejectUnauthorized: false }
    : false,
});

export const db = drizzle(pool);

// Auto-create tables on startup if they don't exist (lightweight migration)
export async function ensureSchema() {
  const ddl = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      email TEXT,
      is_admin BOOLEAN DEFAULT FALSE,
      tier TEXT NOT NULL DEFAULT 'free',
      trial_tier TEXT,
      trial_ends_at TEXT,
      signup_ip TEXT,
      tier_expires_at TEXT,
      total_scans INTEGER NOT NULL DEFAULT 0,
      monthly_scans INTEGER NOT NULL DEFAULT 0,
      monthly_scans_reset_at TEXT,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      created_at TEXT NOT NULL
    );
    -- Idempotent column adds for upgrades from earlier schema versions
    ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_tier TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_ends_at TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_ip TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

    CREATE TABLE IF NOT EXISTS analyses (
      id SERIAL PRIMARY KEY,
      image_url TEXT NOT NULL,
      sport TEXT NOT NULL,
      player_name TEXT NOT NULL,
      player_tier TEXT NOT NULL,
      brand_tier TEXT NOT NULL,
      set_name TEXT,
      year TEXT,
      print_run TEXT NOT NULL,
      grader TEXT NOT NULL,
      grade TEXT NOT NULL,
      auto_type TEXT NOT NULL,
      is_rookie BOOLEAN NOT NULL,
      serial_number TEXT,
      player_jersey TEXT,
      base_card_value INTEGER NOT NULL,
      estimated_fmv INTEGER NOT NULL,
      confidence TEXT NOT NULL,
      ai_raw_response TEXT,
      folder_id INTEGER,
      user_id INTEGER,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS folders (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      color TEXT DEFAULT '#1e3a5f',
      icon TEXT DEFAULT 'folder',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      tier TEXT NOT NULL,
      btc_tx_id TEXT,
      btc_amount TEXT,
      payment_method TEXT DEFAULT 'bitcoin',
      stripe_session_id TEXT,
      stripe_subscription_id TEXT,
      stripe_customer_id TEXT,
      usd_amount TEXT,
      promo_code_used TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      starts_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'bitcoin';
    ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS stripe_session_id TEXT;
    ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
    ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

    -- Verdict cache: persist Grade-or-Sell Verdict results per analysis
    CREATE TABLE IF NOT EXISTS verdicts (
      id SERIAL PRIMARY KEY,
      analysis_id INTEGER NOT NULL,
      user_id INTEGER,
      decision TEXT NOT NULL,            -- GRADE | SELL_RAW | HOLD
      confidence INTEGER NOT NULL,        -- 0..100
      raw_fmv INTEGER NOT NULL,           -- cents
      grade_cost_cents INTEGER NOT NULL,
      probabilities JSONB NOT NULL,       -- {"psa10":0.18,"psa9":0.52,"psa8":0.30}
      predicted_grade_values JSONB NOT NULL, -- {"psa10":89000,...}
      expected_post_grade_value_cents INTEGER NOT NULL,
      expected_roi_cents INTEGER NOT NULL,
      sell_window TEXT,                   -- e.g. "Apr-Jul 2027"
      reasoning TEXT,                     -- AI-written explanation
      created_at TEXT NOT NULL
    );
    ALTER TABLE verdicts ADD COLUMN IF NOT EXISTS sell_window TEXT;

    CREATE TABLE IF NOT EXISTS promo_codes (
      id SERIAL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      description TEXT,
      discount_type TEXT NOT NULL,
      discount_value INTEGER NOT NULL,
      applicable_tiers TEXT NOT NULL DEFAULT 'pro,elite,dealer',
      max_uses INTEGER,
      current_uses INTEGER NOT NULL DEFAULT 0,
      grants_tier TEXT,
      grants_days INTEGER,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      expires_at TEXT,
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS promo_redemptions (
      id SERIAL PRIMARY KEY,
      promo_code_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      redeemed_at TEXT NOT NULL
    );
  `;
  await pool.query(ddl);
}

// Helpers — Drizzle node-postgres returns arrays from every query
const first = <T>(arr: T[]): T | undefined => (arr.length > 0 ? arr[0] : undefined);

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, data: Partial<User>): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;

  // Analyses
  createAnalysis(analysis: InsertAnalysis): Promise<Analysis>;
  getAnalyses(userId?: number): Promise<Analysis[]>;
  getAnalysis(id: number): Promise<Analysis | undefined>;
  getAnalysesByFolder(folderId: number): Promise<Analysis[]>;
  moveAnalysisToFolder(analysisId: number, folderId: number | null): Promise<void>;
  getUserAnalysisCount(userId: number): Promise<number>;
  getUserMonthlyScans(userId: number): Promise<number>;

  // Folders
  createFolder(folder: InsertFolder): Promise<Folder>;
  getFolders(userId: number): Promise<Folder[]>;
  getFolder(id: number): Promise<Folder | undefined>;
  updateFolder(id: number, data: Partial<Folder>): Promise<Folder | undefined>;
  deleteFolder(id: number): Promise<void>;
  getUserFolderCount(userId: number): Promise<number>;

  // Subscriptions
  createSubscription(sub: InsertSubscription): Promise<Subscription>;
  getSubscription(id: number): Promise<Subscription | undefined>;
  getUserSubscriptions(userId: number): Promise<Subscription[]>;
  getActiveSubscription(userId: number): Promise<Subscription | undefined>;
  updateSubscription(id: number, data: Partial<Subscription>): Promise<Subscription | undefined>;
  markStripeSessionConfirmed(
    sessionId: string,
    data: { stripeSubscriptionId: string | null; status: string; expiresAt: string },
  ): Promise<Subscription | undefined>;

  // Stripe helpers
  findUserByEmail(email: string, excludeUserId?: number): Promise<User | undefined>;
  findUserBySignupIp(ip: string, excludeUserId?: number): Promise<User | undefined>;
  findUserByStripeCustomer(customerId: string): Promise<User | undefined>;

  // Promo Codes
  createPromoCode(promo: InsertPromoCode): Promise<PromoCode>;
  getPromoCode(code: string): Promise<PromoCode | undefined>;
  getPromoCodeById(id: number): Promise<PromoCode | undefined>;
  getAllPromoCodes(): Promise<PromoCode[]>;
  updatePromoCode(id: number, data: Partial<PromoCode>): Promise<PromoCode | undefined>;
  deletePromoCode(id: number): Promise<void>;
  incrementPromoUse(id: number): Promise<void>;

  // Promo Redemptions
  createRedemption(redemption: InsertPromoRedemption): Promise<PromoRedemption>;
  getUserRedemptions(userId: number): Promise<PromoRedemption[]>;
  hasUserRedeemedCode(userId: number, promoCodeId: number): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  // ===== USERS =====
  async getUser(id: number): Promise<User | undefined> {
    return first(await db.select().from(users).where(eq(users.id, id)));
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return first(await db.select().from(users).where(eq(users.username, username)));
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const now = new Date().toISOString();
    const result = await db.insert(users).values({
      ...insertUser,
      createdAt: now,
      tier: "free",
      totalScans: 0,
      monthlyScans: 0,
      isAdmin: false,
    }).returning();
    return result[0];
  }

  async updateUser(id: number, data: Partial<User>): Promise<User | undefined> {
    return first(await db.update(users).set(data).where(eq(users.id, id)).returning());
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.id));
  }

  // ===== ANALYSES =====
  async createAnalysis(data: InsertAnalysis): Promise<Analysis> {
    const result = await db.insert(analyses).values(data).returning();
    return result[0];
  }

  async getAnalyses(userId?: number): Promise<Analysis[]> {
    if (userId) {
      return db.select().from(analyses).where(eq(analyses.userId, userId)).orderBy(desc(analyses.id));
    }
    return db.select().from(analyses).orderBy(desc(analyses.id));
  }

  async getAnalysis(id: number): Promise<Analysis | undefined> {
    return first(await db.select().from(analyses).where(eq(analyses.id, id)));
  }

  async getAnalysesByFolder(folderId: number): Promise<Analysis[]> {
    return db.select().from(analyses).where(eq(analyses.folderId, folderId)).orderBy(desc(analyses.id));
  }

  async moveAnalysisToFolder(analysisId: number, folderId: number | null): Promise<void> {
    await db.update(analyses).set({ folderId }).where(eq(analyses.id, analysisId));
  }

  async getUserAnalysisCount(userId: number): Promise<number> {
    const result = first(
      await db.select({ count: sql<number>`count(*)::int` }).from(analyses).where(eq(analyses.userId, userId))
    );
    return result?.count ?? 0;
  }

  async getUserMonthlyScans(userId: number): Promise<number> {
    const user = await this.getUser(userId);
    return user?.monthlyScans ?? 0;
  }

  // ===== FOLDERS =====
  async createFolder(data: InsertFolder): Promise<Folder> {
    const result = await db.insert(folders).values(data).returning();
    return result[0];
  }

  async getFolders(userId: number): Promise<Folder[]> {
    return db.select().from(folders).where(eq(folders.userId, userId)).orderBy(desc(folders.id));
  }

  async getFolder(id: number): Promise<Folder | undefined> {
    return first(await db.select().from(folders).where(eq(folders.id, id)));
  }

  async updateFolder(id: number, data: Partial<Folder>): Promise<Folder | undefined> {
    return first(await db.update(folders).set(data).where(eq(folders.id, id)).returning());
  }

  async deleteFolder(id: number): Promise<void> {
    // Remove folder reference from analyses
    await db.update(analyses).set({ folderId: null }).where(eq(analyses.folderId, id));
    await db.delete(folders).where(eq(folders.id, id));
  }

  async getUserFolderCount(userId: number): Promise<number> {
    const result = first(
      await db.select({ count: sql<number>`count(*)::int` }).from(folders).where(eq(folders.userId, userId))
    );
    return result?.count ?? 0;
  }

  // ===== SUBSCRIPTIONS =====
  async createSubscription(data: InsertSubscription): Promise<Subscription> {
    const result = await db.insert(subscriptions).values(data).returning();
    return result[0];
  }

  async getSubscription(id: number): Promise<Subscription | undefined> {
    return first(await db.select().from(subscriptions).where(eq(subscriptions.id, id)));
  }

  async getUserSubscriptions(userId: number): Promise<Subscription[]> {
    return db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).orderBy(desc(subscriptions.id));
  }

  async getActiveSubscription(userId: number): Promise<Subscription | undefined> {
    return first(
      await db.select().from(subscriptions)
        .where(and(
          eq(subscriptions.userId, userId),
          eq(subscriptions.status, "confirmed"),
        ))
        .orderBy(desc(subscriptions.id))
    );
  }

  async updateSubscription(id: number, data: Partial<Subscription>): Promise<Subscription | undefined> {
    return first(await db.update(subscriptions).set(data).where(eq(subscriptions.id, id)).returning());
  }

  async markStripeSessionConfirmed(
    sessionId: string,
    data: { stripeSubscriptionId: string | null; status: string; expiresAt: string },
  ): Promise<Subscription | undefined> {
    return first(
      await db
        .update(subscriptions)
        .set({
          status: data.status,
          expiresAt: data.expiresAt,
          stripeSubscriptionId: data.stripeSubscriptionId,
        })
        .where(eq(subscriptions.stripeSessionId, sessionId))
        .returning(),
    );
  }

  // ===== Stripe helpers =====
  async findUserByEmail(email: string, excludeUserId?: number): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.email, email));
    return result.find((u) => u.id !== excludeUserId);
  }

  async findUserBySignupIp(ip: string, excludeUserId?: number): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.signupIp, ip));
    return result.find((u) => u.id !== excludeUserId);
  }

  async findUserByStripeCustomer(customerId: string): Promise<User | undefined> {
    return first(
      await db.select().from(users).where(eq(users.stripeCustomerId, customerId)),
    );
  }

  // ===== PROMO CODES =====
  async createPromoCode(data: InsertPromoCode): Promise<PromoCode> {
    const result = await db.insert(promoCodes).values(data).returning();
    return result[0];
  }

  async getPromoCode(code: string): Promise<PromoCode | undefined> {
    return first(await db.select().from(promoCodes).where(eq(promoCodes.code, code.toUpperCase())));
  }

  async getPromoCodeById(id: number): Promise<PromoCode | undefined> {
    return first(await db.select().from(promoCodes).where(eq(promoCodes.id, id)));
  }

  async getAllPromoCodes(): Promise<PromoCode[]> {
    return db.select().from(promoCodes).orderBy(desc(promoCodes.id));
  }

  async updatePromoCode(id: number, data: Partial<PromoCode>): Promise<PromoCode | undefined> {
    return first(await db.update(promoCodes).set(data).where(eq(promoCodes.id, id)).returning());
  }

  async deletePromoCode(id: number): Promise<void> {
    await db.delete(promoCodes).where(eq(promoCodes.id, id));
  }

  async incrementPromoUse(id: number): Promise<void> {
    await db.update(promoCodes)
      .set({ currentUses: sql`${promoCodes.currentUses} + 1` })
      .where(eq(promoCodes.id, id));
  }

  // ===== PROMO REDEMPTIONS =====
  async createRedemption(data: InsertPromoRedemption): Promise<PromoRedemption> {
    const result = await db.insert(promoRedemptions).values(data).returning();
    return result[0];
  }

  async getUserRedemptions(userId: number): Promise<PromoRedemption[]> {
    return db.select().from(promoRedemptions).where(eq(promoRedemptions.userId, userId));
  }

  async hasUserRedeemedCode(userId: number, promoCodeId: number): Promise<boolean> {
    const result = first(
      await db.select().from(promoRedemptions)
        .where(and(
          eq(promoRedemptions.userId, userId),
          eq(promoRedemptions.promoCodeId, promoCodeId),
        ))
    );
    return !!result;
  }
}

export const storage = new DatabaseStorage();
