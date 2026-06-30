import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import Anthropic from "@anthropic-ai/sdk";
import bcrypt from "bcryptjs";
import { TIERS, BTC_WALLET, TRIAL_PREVIEW_HOURS, TRIAL_PREVIEW_TIER, type TierKey } from "@shared/schema";
import { generateVerdict, gateVerdict } from "./verdict";
import {
  stripeEnabled,
  createCheckoutSession,
  handleWebhook,
  startTrialPreview,
  effectiveTier,
} from "./stripeCheckout";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const anthropic = new Anthropic();

// AI Vision prompt for card analysis
const CARD_ANALYSIS_PROMPT = `You are an expert trading card identifier and appraiser, specializing in sports cards AND collectible card games (Pokemon, Magic: The Gathering, Yu-Gi-Oh!, One Piece, etc.).

Analyze this image of a trading card. Identify it as precisely as possible.

Return a JSON object with EXACTLY these fields (ALL string values must be strings, not numbers):
{
  "sport": one of: "basketball", "football", "baseball", "hockey", "soccer", "wnba", "pokemon", "other_tcg", "combat", "golf",
  "playerName": the player or character name visible on the card (STRING),
  "playerTier": one of: "common", "starter", "star", "superstar", "goat" (STRING),
  "brandTier": one of: "budget", "mid", "upper_mid", "premium" (STRING),
  "setName": the full set/product name, e.g. "2023-24 Panini Prizm", "Scarlet & Violet Prismatic Evolutions", "2024 Topps Chrome" (STRING),
  "year": the card year as STRING (e.g. "2023", "2024"),
  "printRun": print run as STRING — "99", "25", "10", "1", or "unlimited" if unnumbered. MUST be a string, never a number.
  "grader": one of: "raw", "psa", "bgs", "sgc", "cgc" (STRING),
  "grade": the grade as STRING — "10", "9.5", "9", or "raw",
  "autoType": one of: "none", "sticker", "on_card", "rpa", "logoman", "cut_sig", "dual_auto", "triple_auto", "inscription" (STRING),
  "isRookie": true or false (BOOLEAN),
  "serialNumber": the actual serial number as STRING (e.g. "23" from "23/99"), or null,
  "playerJersey": player's jersey number as STRING, or null,
  "baseCardValue": integer — estimated USD value of the BASE version (unnumbered, raw, no auto) from recent eBay sold prices. Minimum 1.
  "cardDescription": 1-2 sentence description of what you see (STRING),
  "confidence": "high", "medium", or "low" (STRING)
}

CATEGORIZATION RULES:

• SPORTS CARDS:
  - Basketball (NBA): sport="basketball"
  - Football (NFL): sport="football"
  - Baseball (MLB): sport="baseball"
  - Hockey (NHL): sport="hockey"
  - Soccer / Football: sport="soccer"
  - WNBA: sport="wnba"
  - Boxing / MMA / UFC: sport="combat"
  - Golf / Racing: sport="golf"

• POKEMON TCG: sport="pokemon"
  - Brand tiers: Base packs/basic sets = "budget". Crown Zenith/Prismatic Evolutions/special sets = "mid". Ultra-premium collections = "upper_mid". Illustrator promos / trophy cards = "premium".
  - Player tier for Pokemon: Common/uncommon = "common". Holo rare = "starter". V/VMAX/ex = "star". Alt art/gold/special art rare = "superstar". Illustrator/1st Ed Base Charizard/trophy = "goat".
  - Charizard, Pikachu (Illustrator), 1st Ed Shadowless Base = "goat" tier.
  - Modern Umbreon ex SAR, Charizard ex, Eevee heroes alts = "superstar".

• OTHER TCG (Magic, Yu-Gi-Oh!, One Piece, etc.): sport="other_tcg"
  - Brand tiers: Draft/common sets = "budget". Standard sets = "mid". Premium/collector sets = "upper_mid". Reserved List/Vintage = "premium".
  - Player tier: common/uncommon = "common". Rare = "starter". Mythic/secret = "star". Chase cards = "superstar". Power 9/LOB 1st ed = "goat".

• SPORTS CARD BRANDS:
  - Budget: Donruss, Hoops, Score, Topps base, Bowman base
  - Mid: Prizm, Select, Mosaic, Topps Chrome, Bowman Chrome, Optic
  - Upper-mid: Spectra, Obsidian, Topps Inception, Bowman Sterling
  - Premium: National Treasures, Flawless, Immaculate, Topps Dynasty, Topps Luminaries

• PLAYER TIER (sports):
  - GOAT: Jordan, LeBron, Kobe, Brady, Montana, Gretzky, Messi, Ronaldo, Babe Ruth, Mickey Mantle, Shohei Ohtani, Wayne Gretzky, Tiger Woods
  - Superstar: Active MVPs, perennial All-Stars (Giannis, Curry, Mahomes, Trout, McDavid, Wembanyama, etc.)
  - Star: All-Stars, Pro Bowlers, All-MLB (Tatum, Hurts, Judge, etc.)
  - Starter: Solid starters / rotation players
  - Common: Bench, role players, journeymen

• GRADING:
  - PSA slab: blue label, certification number → grader="psa"
  - BGS slab: silver/gold/black label with subgrades → grader="bgs"
  - SGC slab: green/gold trim, tuxedo style → grader="sgc"
  - CGC slab: red/blue label → grader="cgc"
  - No slab visible → grader="raw", grade="raw"

• SERIAL NUMBERS:
  - Look for numbers like "23/99" stamped or printed on card. The 23 is serialNumber, the 99 is printRun.
  - If no serial number is visible, printRun="unlimited".

• AUTOGRAPHS:
  - No signature → autoType="none"
  - Sticker with signature inside → autoType="sticker"
  - Ink directly on card face → autoType="on_card"
  - Patch window + auto = autoType="rpa"
  - NBA Logoman patch + auto → autoType="logoman"

• BASE CARD VALUE estimation:
  - Think about what the basic version of this card sells for raw and unnumbered on eBay.
  - Most modern base cards: $0.50–$5. Stars: $5–$20. Superstars: $10–$50. GOAT cards: $20–$200+.
  - Pokemon common/uncommon: $0.25–$2. Holo: $2–$10. V/ex: $3–$15. Alt art: $20–$100+. Charizard: $10–$500+ depending on set.
  - Vintage (pre-2000): typically $5–$50+ for base, much higher for key cards.

CRITICAL: Return ONLY the JSON object. No markdown, no backticks, no explanation. All string fields MUST be strings (quoted), never bare numbers.`;

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Analyze card photo with AI vision
  app.post("/api/analyze", upload.single("image"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No image file provided" });
      }

      const base64Image = req.file.buffer.toString("base64");
      const mediaType = req.file.mimetype as
        | "image/jpeg"
        | "image/png"
        | "image/gif"
        | "image/webp";

      // Call Claude Vision to analyze the card
      const message = await anthropic.messages.create({
        model: "claude_sonnet_4_6",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: base64Image,
                },
              },
              {
                type: "text",
                text: CARD_ANALYSIS_PROMPT,
              },
            ],
          },
        ],
      });

      const responseText =
        message.content[0].type === "text" ? message.content[0].text : "";

      // Parse AI response
      let cardData;
      try {
        // Try to extract JSON from response (handle potential markdown wrapping)
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          cardData = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("No JSON found in response");
        }
      } catch (parseErr) {
        return res.status(500).json({
          error: "Failed to parse AI response",
          rawResponse: responseText,
        });
      }

      // Coerce all AI values to proper types (AI may return numbers for string fields)
      const str = (v: any) => v != null ? String(v) : undefined;
      const strReq = (v: any, fallback: string) => v != null ? String(v) : fallback;

      // Run valuation on extracted data
      const valuation = calculateValuation({
        sport: strReq(cardData.sport, "basketball"),
        playerTier: strReq(cardData.playerTier, "common"),
        brandTier: strReq(cardData.brandTier, "budget"),
        printRun: strReq(cardData.printRun, "unlimited"),
        grader: strReq(cardData.grader, "raw"),
        grade: strReq(cardData.grade, "raw"),
        autoType: strReq(cardData.autoType, "none"),
        isRookie: !!cardData.isRookie,
        baseCardValue: Number(cardData.baseCardValue) || 1,
        serialNumber: str(cardData.serialNumber),
        playerJersey: str(cardData.playerJersey),
      });

      // Store the image as data URL for display
      const imageDataUrl = `data:${mediaType};base64,${base64Image}`;

      // Save to database
      const analysis = await storage.createAnalysis({
        imageUrl: imageDataUrl,
        sport: strReq(cardData.sport, "basketball"),
        playerName: strReq(cardData.playerName, "Unknown"),
        playerTier: strReq(cardData.playerTier, "common"),
        brandTier: strReq(cardData.brandTier, "budget"),
        setName: str(cardData.setName) || null,
        year: str(cardData.year) || null,
        printRun: strReq(cardData.printRun, "unlimited"),
        grader: strReq(cardData.grader, "raw"),
        grade: strReq(cardData.grade, "raw"),
        autoType: strReq(cardData.autoType, "none"),
        isRookie: !!cardData.isRookie,
        serialNumber: str(cardData.serialNumber) || null,
        playerJersey: str(cardData.playerJersey) || null,
        baseCardValue: Number(cardData.baseCardValue) || 1,
        estimatedFmv: Math.round(valuation.estimatedFmv),
        confidence: strReq(cardData.confidence, "medium"),
        aiRawResponse: responseText,
        createdAt: new Date().toISOString(),
      });

      // Generate grading recommendation and selling platform advice
      const gradingRec = calculateGradingRecommendation({
        sport: strReq(cardData.sport, "basketball"),
        playerTier: strReq(cardData.playerTier, "common"),
        brandTier: strReq(cardData.brandTier, "budget"),
        printRun: strReq(cardData.printRun, "unlimited"),
        grader: strReq(cardData.grader, "raw"),
        grade: strReq(cardData.grade, "raw"),
        autoType: strReq(cardData.autoType, "none"),
        isRookie: !!cardData.isRookie,
        baseCardValue: Number(cardData.baseCardValue) || 1,
        fmv: valuation.estimatedFmv,
      });

      const sellingRec = calculateSellingRecommendation({
        sport: strReq(cardData.sport, "basketball"),
        playerTier: strReq(cardData.playerTier, "common"),
        brandTier: strReq(cardData.brandTier, "budget"),
        printRun: strReq(cardData.printRun, "unlimited"),
        grader: strReq(cardData.grader, "raw"),
        autoType: strReq(cardData.autoType, "none"),
        isRookie: !!cardData.isRookie,
        fmv: valuation.estimatedFmv,
      });

      res.json({
        analysis,
        cardData,
        valuation,
        gradingRecommendation: gradingRec,
        sellingRecommendation: sellingRec,
        cardDescription: cardData.cardDescription || "",
      });
    } catch (error: any) {
      console.error("Analysis error:", error);
      res.status(500).json({
        error: "Failed to analyze card",
        details: error.message,
      });
    }
  });

  // Manual valuation (without photo — use form input)
  app.post("/api/valuate", async (req, res) => {
    try {
      const b = req.body;
      const cardInput = {
        sport: String(b.sport || "basketball"),
        playerTier: String(b.playerTier || "common"),
        brandTier: String(b.brandTier || "budget"),
        printRun: String(b.printRun || "unlimited"),
        grader: String(b.grader || "raw"),
        grade: String(b.grade || "raw"),
        autoType: String(b.autoType || "none"),
        isRookie: !!b.isRookie,
        baseCardValue: Number(b.baseCardValue) || 1,
        serialNumber: b.serialNumber != null ? String(b.serialNumber) : undefined,
        playerJersey: b.playerJersey != null ? String(b.playerJersey) : undefined,
      };
      const valuation = calculateValuation(cardInput);
      const gradingRec = calculateGradingRecommendation({
        ...cardInput,
        fmv: valuation.estimatedFmv,
      });
      const sellingRec = calculateSellingRecommendation({
        ...cardInput,
        fmv: valuation.estimatedFmv,
      });
      res.json({ valuation, gradingRecommendation: gradingRec, sellingRecommendation: sellingRec });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get analysis history
  app.get("/api/analyses", async (_req, res) => {
    const list = await storage.getAnalyses();
    res.json(list);
  });

  // Get single analysis
  app.get("/api/analyses/:id", async (req, res) => {
    const analysis = await storage.getAnalysis(parseInt(req.params.id));
    if (!analysis) return res.status(404).json({ error: "Not found" });
    res.json(analysis);
  });

  // ============================================================
  // AUTH ROUTES
  // ============================================================

  app.post("/api/auth/register", async (req, res) => {
    try {
      const { username, password, email } = req.body;
      if (!username || !password) return res.status(400).json({ error: "Username and password required" });
      if (username.length < 3) return res.status(400).json({ error: "Username must be at least 3 characters" });
      if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });
      
      const existing = await storage.getUserByUsername(username);
      if (existing) return res.status(409).json({ error: "Username already taken" });
      
      const hashed = await bcrypt.hash(password, 10);
      const user = await storage.createUser({ username, password: hashed, email: email || null });
      
      const { password: _, ...safeUser } = user;
      res.json({ user: safeUser });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) return res.status(400).json({ error: "Username and password required" });
      
      const user = await storage.getUserByUsername(username);
      if (!user) return res.status(401).json({ error: "Invalid credentials" });
      
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) return res.status(401).json({ error: "Invalid credentials" });
      
      // Check if subscription expired
      if (user.tier !== "free" && user.tierExpiresAt) {
        const expiry = new Date(user.tierExpiresAt);
        if (expiry < new Date()) {
          await storage.updateUser(user.id, { tier: "free", tierExpiresAt: null });
          user.tier = "free";
          user.tierExpiresAt = null;
        }
      }
      
      // Reset monthly scans if new month
      const now = new Date();
      if (user.monthlyScansResetAt) {
        const resetDate = new Date(user.monthlyScansResetAt);
        if (now.getMonth() !== resetDate.getMonth() || now.getFullYear() !== resetDate.getFullYear()) {
          await storage.updateUser(user.id, { monthlyScans: 0, monthlyScansResetAt: now.toISOString() });
          user.monthlyScans = 0;
        }
      }
      
      const { password: _, ...safeUser } = user;
      res.json({ user: safeUser });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/auth/user/:id", async (req, res) => {
    const user = await storage.getUser(parseInt(req.params.id));
    if (!user) return res.status(404).json({ error: "User not found" });
    const { password: _, ...safeUser } = user;
    res.json(safeUser);
  });

  // ============================================================
  // TIER & SUBSCRIPTION ROUTES
  // ============================================================

  app.get("/api/tiers", (_req, res) => {
    res.json({ tiers: TIERS, btcWallet: BTC_WALLET });
  });

  // Submit subscription payment
  app.post("/api/subscriptions", async (req, res) => {
    try {
      const { userId, tier, btcTxId, btcAmount, promoCode } = req.body;
      if (!userId || !tier) return res.status(400).json({ error: "userId and tier required" });
      if (!TIERS[tier as TierKey]) return res.status(400).json({ error: "Invalid tier" });
      if (tier === "free") return res.status(400).json({ error: "Cannot subscribe to free tier" });
      
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ error: "User not found" });
      
      let discountPercent = 0;
      let grantedDays = 30; // default monthly
      let promoCodeUsed: string | null = null;
      
      // Handle promo code
      if (promoCode) {
        const promo = await storage.getPromoCode(promoCode.toUpperCase());
        if (!promo) return res.status(400).json({ error: "Invalid promo code" });
        if (!promo.isActive) return res.status(400).json({ error: "Promo code is inactive" });
        if (promo.expiresAt && new Date(promo.expiresAt) < new Date()) return res.status(400).json({ error: "Promo code expired" });
        if (promo.maxUses && promo.currentUses >= promo.maxUses) return res.status(400).json({ error: "Promo code usage limit reached" });
        
        const alreadyUsed = await storage.hasUserRedeemedCode(userId, promo.id);
        if (alreadyUsed) return res.status(400).json({ error: "You already used this promo code" });
        
        const applicableTiers = promo.applicableTiers.split(",");
        if (!applicableTiers.includes(tier)) return res.status(400).json({ error: "Promo code not applicable to this tier" });
        
        if (promo.discountType === "percentage") discountPercent = promo.discountValue;
        if (promo.discountType === "free_trial" && promo.grantsDays) grantedDays = promo.grantsDays;
        if (promo.discountType === "free_tier" && promo.grantsTier) {
          // Grant tier directly without payment
          const days = promo.grantsDays || 30;
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + days);
          await storage.updateUser(userId, {
            tier: promo.grantsTier,
            tierExpiresAt: expiresAt.toISOString(),
          });
          await storage.incrementPromoUse(promo.id);
          await storage.createRedemption({ promoCodeId: promo.id, userId, redeemedAt: new Date().toISOString() });
          const updatedUser = await storage.getUser(userId);
          const { password: _, ...safeUser } = updatedUser!;
          return res.json({ message: "Promo applied! Tier upgraded.", user: safeUser });
        }
        
        promoCodeUsed = promo.code;
        await storage.incrementPromoUse(promo.id);
        await storage.createRedemption({ promoCodeId: promo.id, userId, redeemedAt: new Date().toISOString() });
      }
      
      const tierPrice = TIERS[tier as TierKey].price;
      const finalPrice = tierPrice * (1 - discountPercent / 100);
      
      const now = new Date();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + grantedDays);
      
      const sub = await storage.createSubscription({
        userId,
        tier,
        btcTxId: btcTxId || null,
        btcAmount: btcAmount || null,
        usdAmount: finalPrice.toFixed(2),
        promoCodeUsed,
        status: btcTxId ? "confirmed" : "pending",
        startsAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        createdAt: now.toISOString(),
      });
      
      // If BTC tx provided, activate immediately
      if (btcTxId) {
        await storage.updateUser(userId, {
          tier,
          tierExpiresAt: expiresAt.toISOString(),
        });
      }
      
      const updatedUser = await storage.getUser(userId);
      const { password: _, ...safeUser } = updatedUser!;
      res.json({ subscription: sub, user: safeUser });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Confirm pending subscription (admin use)
  app.post("/api/subscriptions/:id/confirm", async (req, res) => {
    try {
      const sub = await storage.getSubscription(parseInt(req.params.id));
      if (!sub) return res.status(404).json({ error: "Subscription not found" });
      
      await storage.updateSubscription(sub.id, { status: "confirmed" });
      await storage.updateUser(sub.userId, {
        tier: sub.tier,
        tierExpiresAt: sub.expiresAt,
      });
      
      res.json({ message: "Subscription confirmed" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/subscriptions/user/:userId", async (req, res) => {
    const subs = await storage.getUserSubscriptions(parseInt(req.params.userId));
    res.json(subs);
  });

  // ============================================================
  // FOLDER ROUTES (Pro+ only)
  // ============================================================

  app.post("/api/folders", async (req, res) => {
    try {
      const { userId, name, description, color, icon } = req.body;
      if (!userId || !name) return res.status(400).json({ error: "userId and name required" });
      
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ error: "User not found" });
      
      const tierKey = (user.tier || "free") as TierKey;
      const tierConfig = TIERS[tierKey];
      if (tierConfig.folders === 0) return res.status(403).json({ error: "Folders require a Pro subscription or higher", requiredTier: "pro" });
      
      const currentCount = await storage.getUserFolderCount(userId);
      if (tierConfig.folders !== -1 && currentCount >= tierConfig.folders) {
        return res.status(403).json({ error: `Folder limit reached (${tierConfig.folders}). Upgrade for more.`, requiredTier: tierKey === "pro" ? "elite" : "dealer" });
      }
      
      const now = new Date().toISOString();
      const folder = await storage.createFolder({
        userId,
        name,
        description: description || null,
        color: color || "#1e3a5f",
        icon: icon || "folder",
        createdAt: now,
        updatedAt: now,
      });
      
      res.json(folder);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/folders/:userId", async (req, res) => {
    const foldersData = await storage.getFolders(parseInt(req.params.userId));
    res.json(foldersData);
  });

  app.patch("/api/folders/:id", async (req, res) => {
    try {
      const updated = await storage.updateFolder(parseInt(req.params.id), {
        ...req.body,
        updatedAt: new Date().toISOString(),
      });
      if (!updated) return res.status(404).json({ error: "Folder not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/folders/:id", async (req, res) => {
    await storage.deleteFolder(parseInt(req.params.id));
    res.json({ message: "Folder deleted" });
  });

  // Move analysis to/from folder
  app.post("/api/analyses/:id/move", async (req, res) => {
    try {
      const { folderId } = req.body;
      await storage.moveAnalysisToFolder(parseInt(req.params.id), folderId || null);
      res.json({ message: "Moved" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/folders/:folderId/analyses", async (req, res) => {
    const list = await storage.getAnalysesByFolder(parseInt(req.params.folderId));
    res.json(list);
  });

  // ============================================================
  // ADMIN ROUTES
  // ============================================================

  // Admin login
  app.post("/api/admin/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      const user = await storage.getUserByUsername(username);
      if (!user) return res.status(401).json({ error: "Invalid credentials" });
      
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) return res.status(401).json({ error: "Invalid credentials" });
      if (!user.isAdmin) return res.status(403).json({ error: "Not an administrator" });
      
      const { password: _, ...safeUser } = user;
      res.json({ user: safeUser });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Bootstrap admin (first-time setup — only works if no admins exist)
  app.post("/api/admin/bootstrap", async (req, res) => {
    try {
      const { username, password, email } = req.body;
      if (!username || !password) return res.status(400).json({ error: "Username and password required" });
      
      // Check if any admin exists
      const allUsers = await storage.getAllUsers();
      const existingAdmin = allUsers.find(u => u.isAdmin);
      if (existingAdmin) return res.status(403).json({ error: "Admin already exists. Use admin login." });
      
      const hashed = await bcrypt.hash(password, 10);
      const user = await storage.createUser({ username, password: hashed, email: email || null });
      await storage.updateUser(user.id, { isAdmin: true, tier: "dealer", tierExpiresAt: null });
      
      const updated = await storage.getUser(user.id);
      const { password: _, ...safeUser } = updated!;
      res.json({ user: safeUser, message: "Admin account created" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Promo code CRUD (admin only)
  app.get("/api/admin/promo-codes", async (req, res) => {
    const codes = await storage.getAllPromoCodes();
    res.json(codes);
  });

  app.post("/api/admin/promo-codes", async (req, res) => {
    try {
      const { code, description, discountType, discountValue, applicableTiers, maxUses, grantsTier, grantsDays, expiresAt, createdBy } = req.body;
      if (!code || !discountType || discountValue == null || !createdBy) {
        return res.status(400).json({ error: "code, discountType, discountValue, and createdBy required" });
      }
      
      const existing = await storage.getPromoCode(code.toUpperCase());
      if (existing) return res.status(409).json({ error: "Promo code already exists" });
      
      const promo = await storage.createPromoCode({
        code: code.toUpperCase(),
        description: description || null,
        discountType,
        discountValue: Number(discountValue),
        applicableTiers: applicableTiers || "pro,elite,dealer",
        maxUses: maxUses ? Number(maxUses) : null,
        currentUses: 0,
        grantsTier: grantsTier || null,
        grantsDays: grantsDays ? Number(grantsDays) : null,
        isActive: true,
        expiresAt: expiresAt || null,
        createdBy: Number(createdBy),
        createdAt: new Date().toISOString(),
      });
      
      res.json(promo);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/admin/promo-codes/:id", async (req, res) => {
    try {
      const updated = await storage.updatePromoCode(parseInt(req.params.id), req.body);
      if (!updated) return res.status(404).json({ error: "Promo code not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/admin/promo-codes/:id", async (req, res) => {
    await storage.deletePromoCode(parseInt(req.params.id));
    res.json({ message: "Promo code deleted" });
  });

  // Admin: list all users
  app.get("/api/admin/users", async (_req, res) => {
    const allUsers = await storage.getAllUsers();
    const safe = allUsers.map(u => { const { password: _, ...s } = u; return s; });
    res.json(safe);
  });

  // Admin: update user tier manually
  app.patch("/api/admin/users/:id", async (req, res) => {
    try {
      const updated = await storage.updateUser(parseInt(req.params.id), req.body);
      if (!updated) return res.status(404).json({ error: "User not found" });
      const { password: _, ...safeUser } = updated;
      res.json(safeUser);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Admin: all subscriptions
  app.get("/api/admin/subscriptions", async (_req, res) => {
    // Get all users' subscriptions
    const allUsers = await storage.getAllUsers();
    const allSubs: any[] = [];
    for (const u of allUsers) {
      const subs = await storage.getUserSubscriptions(u.id);
      allSubs.push(...subs.map(s => ({ ...s, username: u.username })));
    }
    res.json(allSubs);
  });

  // Validate promo code (public, for checking at checkout)
  app.post("/api/promo/validate", async (req, res) => {
    try {
      const { code, userId, tier } = req.body;
      if (!code) return res.status(400).json({ error: "Code required" });
      
      const promo = await storage.getPromoCode(code.toUpperCase());
      if (!promo) return res.status(404).json({ error: "Invalid promo code" });
      if (!promo.isActive) return res.status(400).json({ error: "Promo code is inactive" });
      if (promo.expiresAt && new Date(promo.expiresAt) < new Date()) return res.status(400).json({ error: "Promo code has expired" });
      if (promo.maxUses && promo.currentUses >= promo.maxUses) return res.status(400).json({ error: "Promo code usage limit reached" });
      
      if (userId) {
        const alreadyUsed = await storage.hasUserRedeemedCode(userId, promo.id);
        if (alreadyUsed) return res.status(400).json({ error: "You already used this promo code" });
      }
      
      if (tier) {
        const applicableTiers = promo.applicableTiers.split(",");
        if (!applicableTiers.includes(tier)) return res.status(400).json({ error: "Promo not valid for this tier" });
      }
      
      res.json({
        valid: true,
        discountType: promo.discountType,
        discountValue: promo.discountValue,
        grantsTier: promo.grantsTier,
        grantsDays: promo.grantsDays,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Track scan usage
  app.post("/api/track-scan", async (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) return res.json({ ok: true }); // anonymous scan
      
      const user = await storage.getUser(userId);
      if (!user) return res.json({ ok: true });
      
      const tierKey = (user.tier || "free") as TierKey;
      const tierConfig = TIERS[tierKey];
      const limit = tierConfig.monthlyScans;
      
      if (limit !== -1 && user.monthlyScans >= limit) {
        return res.status(403).json({ error: "Monthly scan limit reached", limit, used: user.monthlyScans, requiredTier: tierKey === "free" ? "pro" : tierKey === "pro" ? "elite" : "dealer" });
      }
      
      await storage.updateUser(userId, {
        monthlyScans: (user.monthlyScans || 0) + 1,
        totalScans: (user.totalScans || 0) + 1,
        monthlyScansResetAt: user.monthlyScansResetAt || new Date().toISOString(),
      });
      
      res.json({ ok: true, scansUsed: (user.monthlyScans || 0) + 1, limit });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });


  // ============================================================
  // GRADE-OR-SELL VERDICT — CardScan Pro's moat feature
  // ============================================================
  app.post("/api/verdict/:analysisId", async (req, res) => {
    try {
      const analysisId = parseInt(req.params.analysisId, 10);
      const userId = req.body.userId ? parseInt(req.body.userId, 10) : undefined;
      const analysis = await storage.getAnalysis(analysisId);
      if (!analysis) return res.status(404).json({ error: "Analysis not found" });
      let tier: TierKey = "free";
      if (userId) {
        const u = await storage.getUser(userId);
        if (u) tier = effectiveTier(u);
      }
      const verdict = await generateVerdict(analysis);
      res.json({ verdict: gateVerdict(verdict, tier), tier });
    } catch (error: any) {
      res.status(500).json({ error: error.message ?? "Failed to generate verdict" });
    }
  });

  // ============================================================
  // STRIPE CHECKOUT + WEBHOOK + 24h TRIAL PREVIEW
  // ============================================================
  app.get("/api/stripe/status", (_req, res) => {
    res.json({ enabled: stripeEnabled() });
  });

  app.post("/api/stripe/checkout", async (req, res) => {
    try {
      if (!stripeEnabled()) {
        return res.status(503).json({ error: "Stripe is not configured on this server. Set STRIPE_SECRET_KEY." });
      }
      const { userId, tier, promoCode, successUrl, cancelUrl } = req.body as {
        userId: number;
        tier: Exclude<TierKey, "free">;
        promoCode?: string;
        successUrl?: string;
        cancelUrl?: string;
      };
      if (!userId || !tier) return res.status(400).json({ error: "userId and tier required" });
      if ((tier as any) === "free") return res.status(400).json({ error: "Cannot subscribe to free tier" });
      if (!TIERS[tier]) return res.status(400).json({ error: "Invalid tier" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ error: "User not found" });
      const origin = (req.headers.origin as string) || `http://${req.headers.host}`;
      const session = await createCheckoutSession({
        user,
        tier,
        successUrl: successUrl || `${origin}/?stripe=success`,
        cancelUrl: cancelUrl || `${origin}/pricing?stripe=cancel`,
        promoCode,
        clientIp: req.ip,
      });
      const refreshedUser = await storage.getUser(userId);
      const trial = refreshedUser
        ? await startTrialPreview({ user: refreshedUser, clientIp: req.ip })
        : { granted: false };
      res.json({ url: session.url, sessionId: session.sessionId, trial });
    } catch (error: any) {
      console.error("Stripe checkout failed:", error);
      res.status(500).json({ error: error.message ?? "Stripe checkout failed" });
    }
  });

  app.post("/api/stripe/webhook", async (req, res) => {
    try {
      const result = await handleWebhook(req);
      res.json(result);
    } catch (error: any) {
      console.error("Stripe webhook error:", error.message);
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/trial/status/:userId", async (req, res) => {
    const userId = parseInt(req.params.userId, 10);
    const user = await storage.getUser(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    const tier = effectiveTier(user);
    const hasActiveTrial =
      !!user.trialTier && !!user.trialEndsAt && new Date(user.trialEndsAt).getTime() > Date.now();
    res.json({
      tier,
      paidTier: user.tier,
      trialTier: user.trialTier,
      trialEndsAt: user.trialEndsAt,
      hasActiveTrial,
      trialPreviewHours: TRIAL_PREVIEW_HOURS,
      trialPreviewTier: TRIAL_PREVIEW_TIER,
    });
  });

  // ============================================================
  // BULK ARBITRAGE SCANNER (Elite+)
  // ============================================================
  app.post("/api/arbitrage/rank", async (req, res) => {
    try {
      const { userId, analysisIds } = req.body as { userId: number; analysisIds: number[] };
      if (!userId) return res.status(400).json({ error: "userId required" });
      if (!Array.isArray(analysisIds) || analysisIds.length === 0) {
        return res.status(400).json({ error: "analysisIds[] required" });
      }
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ error: "User not found" });
      const tier = effectiveTier(user);
      if (tier !== "elite" && tier !== "dealer") {
        return res.status(403).json({ error: "Bulk Arbitrage Scanner requires Elite or Dealer tier", requiredTier: "elite" });
      }
      const results: any[] = [];
      for (const id of analysisIds.slice(0, 500)) {
        const a = await storage.getAnalysis(id);
        if (!a) continue;
        const v = await generateVerdict(a);
        results.push({
          analysisId: id,
          playerName: a.playerName,
          setName: a.setName,
          year: a.year,
          decision: v.decision,
          confidence: v.confidence,
          rawFmvCents: v.rawFmv,
          expectedRoiCents: v.expectedRoiCents,
          recommended: v.decision === "GRADE" && v.expectedRoiCents > 0,
        });
      }
      results.sort((a, b) => b.expectedRoiCents - a.expectedRoiCents);
      res.json({
        count: results.length,
        recommendedCount: results.filter((r) => r.recommended).length,
        results,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================
  // PSA / BGS / SGC SUBMISSION PREP CSV (Dealer)
  // ============================================================
  app.post("/api/submission/prep", async (req, res) => {
    try {
      const { userId, analysisIds, service } = req.body as {
        userId: number;
        analysisIds: number[];
        service?: "psa" | "bgs" | "sgc";
      };
      if (!userId) return res.status(400).json({ error: "userId required" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ error: "User not found" });
      const tier = effectiveTier(user);
      if (tier !== "dealer") {
        return res.status(403).json({ error: "PSA Submission Prep requires Dealer tier", requiredTier: "dealer" });
      }
      const svc = (service ?? "psa").toUpperCase();
      const rows: string[] = [];
      rows.push(["Service", "Year", "Brand/Set", "Player", "CardNumber", "DeclaredValue", "Notes"].join(","));
      for (const id of analysisIds.slice(0, 1000)) {
        const a = await storage.getAnalysis(id);
        if (!a) continue;
        rows.push(
          [
            svc,
            csvSafe(a.year ?? ""),
            csvSafe(`${a.brandTier} / ${a.setName ?? ""}`),
            csvSafe(a.playerName),
            csvSafe(a.serialNumber ?? ""),
            String(a.estimatedFmv),
            csvSafe(`Rookie:${a.isRookie ? "Y" : "N"} Auto:${a.autoType}`),
          ].join(","),
        );
      }
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="submission-${svc.toLowerCase()}-${Date.now()}.csv"`,
      );
      res.send(rows.join("\n"));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return httpServer;
}

// ============================================================
// VALUATION ENGINE (ported from CardVal Pro)
// ============================================================

interface CardInput {
  sport: string;
  playerTier: string;
  brandTier: string;
  printRun: string;
  grader: string;
  grade: string;
  autoType: string;
  isRookie: boolean;
  baseCardValue: number;
  serialNumber?: string;
  playerJersey?: string;
}

interface MultiplierBreakdown {
  factor: string;
  multiplier: number;
  low: number;
  high: number;
  description: string;
}

interface ValuationResult {
  estimatedFmv: number;
  optimalListBin: number;
  optimalListAuction: number;
  netProceedsBin: number;
  netProceedsAuction: number;
  dealerCashOffer: number;
  breakdown: MultiplierBreakdown[];
  confidence: "high" | "medium" | "low";
  marketTrend: string;
  notes: string[];
}

function getSerialMultiplier(printRun: string) {
  const pr = printRun.toLowerCase();
  if (pr === "1" || pr === "1/1")
    return { mid: 3000, low: 1000, high: 10000, desc: "1/1 — Ultimate rarity" };
  if (pr === "5")
    return { mid: 1000, low: 800, high: 1500, desc: "/5 — Near one-of-one" };
  if (pr === "10")
    return { mid: 650, low: 500, high: 800, desc: "/10 — Elite print" };
  if (pr === "15")
    return { mid: 400, low: 300, high: 550, desc: "/15 — Ultra-low" };
  if (pr === "25")
    return { mid: 275, low: 50, high: 500, desc: "/25 — Ultra-low print" };
  if (pr === "35")
    return { mid: 160, low: 100, high: 220, desc: "/35 — Low print" };
  if (pr === "49" || pr === "50")
    return { mid: 125, low: 50, high: 250, desc: "/49–50 — Ultra-low" };
  if (pr === "75")
    return { mid: 100, low: 60, high: 180, desc: "/75 — Low print" };
  if (pr === "99")
    return { mid: 80, low: 10, high: 150, desc: "/99 — Sweet spot tier" };
  if (pr === "149" || pr === "150")
    return { mid: 20, low: 5, high: 40, desc: "/149–150 — Mid print" };
  if (pr === "199")
    return { mid: 15, low: 3, high: 40, desc: "/199 — Mid print" };
  if (pr === "249")
    return { mid: 10, low: 3, high: 35, desc: "/249 — Mid-high print" };
  if (pr === "299")
    return { mid: 8, low: 3, high: 30, desc: "/299 — Mid-high print" };
  if (pr === "499")
    return { mid: 4, low: 2, high: 6, desc: "/499 — High print" };
  if (pr === "599" || pr === "699" || pr === "799")
    return { mid: 3, low: 2, high: 4, desc: "/599–799 — High print" };
  if (pr === "999")
    return {
      mid: 1.75,
      low: 1.5,
      high: 2,
      desc: "/999 — Minimal scarcity premium",
    };
  if (pr === "unlimited" || pr === "" || pr === "base")
    return { mid: 1, low: 1, high: 1, desc: "Unnumbered base" };

  const num = parseInt(pr);
  if (!isNaN(num)) {
    if (num <= 1)
      return { mid: 3000, low: 1000, high: 10000, desc: `1/1 — Ultimate rarity` };
    if (num <= 5) return { mid: 1000, low: 800, high: 1500, desc: `/${num} — Near 1/1` };
    if (num <= 10) return { mid: 650, low: 500, high: 800, desc: `/${num} — Elite` };
    if (num <= 25) return { mid: 275, low: 50, high: 500, desc: `/${num} — Ultra-low` };
    if (num <= 50) return { mid: 125, low: 50, high: 250, desc: `/${num} — Low` };
    if (num <= 99)
      return { mid: 80, low: 10, high: 150, desc: `/${num} — Investment tier` };
    if (num <= 199) return { mid: 15, low: 3, high: 40, desc: `/${num} — Mid print` };
    if (num <= 299) return { mid: 8, low: 3, high: 30, desc: `/${num} — Mid-high` };
    if (num <= 499) return { mid: 4, low: 2, high: 6, desc: `/${num}` };
    if (num <= 999) return { mid: 2, low: 1.5, high: 3, desc: `/${num}` };
    return { mid: 1.2, low: 1, high: 1.5, desc: `/${num} — High print` };
  }

  return { mid: 1, low: 1, high: 1, desc: "Unknown print run" };
}

function getGradeMultiplier(grader: string, grade: string) {
  const g = grade.toLowerCase().trim();
  const gr = grader.toLowerCase();

  if (gr === "raw" || gr === "ungraded")
    return { mid: 1, low: 1, high: 1, desc: "Raw / Ungraded" };

  if (gr === "psa") {
    if (g === "10" || g === "gem mint")
      return { mid: 3.5, low: 2.5, high: 5, desc: "PSA 10 Gem Mint" };
    if (g === "9") return { mid: 1.5, low: 1.2, high: 2, desc: "PSA 9 Mint" };
    if (g === "8.5")
      return { mid: 1.15, low: 1.05, high: 1.3, desc: "PSA 8.5 NM-MT+" };
    if (g === "8") return { mid: 1.05, low: 0.95, high: 1.2, desc: "PSA 8 NM-MT" };
    if (g === "7") return { mid: 0.8, low: 0.6, high: 1, desc: "PSA 7 NM" };
    if (g === "6") return { mid: 0.5, low: 0.35, high: 0.7, desc: "PSA 6 EX-MT" };
    if (g === "5") return { mid: 0.35, low: 0.25, high: 0.5, desc: "PSA 5 EX" };
    if (g === "4") return { mid: 0.25, low: 0.15, high: 0.35, desc: "PSA 4 VG-EX" };
    if (g === "3") return { mid: 0.15, low: 0.1, high: 0.25, desc: "PSA 3 VG" };
    if (g === "2") return { mid: 0.1, low: 0.05, high: 0.15, desc: "PSA 2 Good" };
    if (g === "1" || g === "1.5")
      return { mid: 0.05, low: 0.02, high: 0.1, desc: "PSA 1/1.5 — Poor/Fair" };
    return { mid: 1, low: 0.8, high: 1.2, desc: `PSA ${grade}` };
  }

  if (gr === "bgs" || gr === "beckett") {
    if (g === "10" || g === "pristine" || g === "black label")
      return { mid: 8, low: 5, high: 20, desc: "BGS 10 Black Label — 2-4x PSA 10" };
    if (g === "9.5" || g === "gem mint")
      return { mid: 2.5, low: 1.5, high: 3.5, desc: "BGS 9.5 Gem Mint" };
    if (g === "9") return { mid: 1.3, low: 1, high: 1.6, desc: "BGS 9 Mint" };
    if (g === "8.5") return { mid: 1.1, low: 0.9, high: 1.3, desc: "BGS 8.5" };
    if (g === "8") return { mid: 0.9, low: 0.7, high: 1.1, desc: "BGS 8 NM-MT" };
    return { mid: 0.7, low: 0.5, high: 0.9, desc: `BGS ${grade}` };
  }

  if (gr === "sgc") {
    if (g === "10" || g === "pristine")
      return { mid: 2.2, low: 1.5, high: 3, desc: "SGC 10 Pristine" };
    if (g === "9.5") return { mid: 1.8, low: 1.3, high: 2.5, desc: "SGC 9.5" };
    if (g === "9") return { mid: 1.3, low: 1, high: 1.6, desc: "SGC 9" };
    if (g === "8") return { mid: 0.95, low: 0.8, high: 1.1, desc: "SGC 8" };
    return { mid: 0.8, low: 0.6, high: 1, desc: `SGC ${grade}` };
  }

  if (gr === "cgc") {
    if (g === "10" || g === "pristine")
      return { mid: 2, low: 1.3, high: 2.8, desc: "CGC 10" };
    if (g === "9.5") return { mid: 1.5, low: 1.1, high: 2, desc: "CGC 9.5" };
    if (g === "9") return { mid: 1.1, low: 0.9, high: 1.4, desc: "CGC 9" };
    return { mid: 0.85, low: 0.7, high: 1, desc: `CGC ${grade}` };
  }

  return { mid: 1, low: 0.8, high: 1.2, desc: `${grader} ${grade}` };
}

function getAutoMultiplier(autoType: string) {
  switch (autoType) {
    case "none": return { mid: 1, low: 1, high: 1, desc: "No autograph" };
    case "sticker": return { mid: 3.5, low: 2, high: 5, desc: "Sticker auto" };
    case "on_card": return { mid: 5, low: 3, high: 8, desc: "On-card auto — ~45% over sticker" };
    case "rpa": return { mid: 20, low: 10, high: 30, desc: "Rookie Patch Auto — Premier format" };
    case "logoman": return { mid: 200, low: 50, high: 500, desc: "Logoman auto — Ultra-premium" };
    case "cut_sig": return { mid: 20, low: 5, high: 50, desc: "Cut signature" };
    case "dual_auto": return { mid: 8, low: 4, high: 15, desc: "Dual auto" };
    case "triple_auto": return { mid: 12, low: 6, high: 25, desc: "Triple auto" };
    case "inscription": return { mid: 6, low: 3, high: 10, desc: "Inscription auto" };
    default: return { mid: 1, low: 1, high: 1, desc: "No auto" };
  }
}

function getPlayerTierMultiplier(tier: string) {
  switch (tier) {
    case "common": return { mid: 1, low: 1, high: 1, desc: "Common / Role player" };
    case "starter": return { mid: 3.5, low: 2, high: 5, desc: "Starter / Average starter" };
    case "star": return { mid: 20, low: 10, high: 30, desc: "Star / All-Star level" };
    case "superstar": return { mid: 100, low: 50, high: 200, desc: "Superstar / MVP caliber" };
    case "goat": return { mid: 2000, low: 500, high: 10000, desc: "GOAT tier" };
    default: return { mid: 1, low: 1, high: 1, desc: "Unknown tier" };
  }
}

function getBrandMultiplier(tier: string) {
  switch (tier) {
    case "budget": return { mid: 1, low: 1, high: 1, desc: "Budget (Donruss, Hoops, Score)" };
    case "mid": return { mid: 8, low: 3, high: 15, desc: "Mid-tier (Prizm, Select, Mosaic)" };
    case "upper_mid": return { mid: 20, low: 10, high: 30, desc: "Upper-mid (Spectra, Obsidian)" };
    case "premium": return { mid: 50, low: 20, high: 100, desc: "Premium (National Treasures, Flawless)" };
    default: return { mid: 1, low: 1, high: 1, desc: "Unknown brand tier" };
  }
}

function getSportMultiplier(sport: string) {
  switch (sport) {
    case "basketball": return { mid: 1, low: 1, high: 1, desc: "Basketball — Highest global demand" };
    case "baseball": return { mid: 0.8, low: 0.7, high: 0.9, desc: "Baseball — Traditional backbone" };
    case "football": return { mid: 0.5, low: 0.4, high: 0.6, desc: "Football — US-centric, QB-dominant" };
    case "hockey": return { mid: 0.3, low: 0.2, high: 0.4, desc: "Hockey — Niche market" };
    case "soccer": return { mid: 0.55, low: 0.3, high: 0.8, desc: "Soccer — Growing rapidly (+91%)" };
    case "pokemon": return { mid: 1.2, low: 0.8, high: 2, desc: "Pokemon — +85% in 2025" };
    case "other_tcg": return { mid: 0.6, low: 0.3, high: 1.2, desc: "Other TCG" };
    case "combat": return { mid: 0.2, low: 0.1, high: 0.3, desc: "Combat sports — Niche" };
    case "golf": return { mid: 0.12, low: 0.05, high: 0.2, desc: "Golf / Racing / Other" };
    case "wnba": return { mid: 0.6, low: 0.4, high: 0.9, desc: "WNBA — Emerging market" };
    default: return { mid: 0.5, low: 0.3, high: 0.8, desc: sport };
  }
}

function getRookiePremium(isRookie: boolean) {
  if (isRookie)
    return { mid: 2, low: 1.5, high: 4, desc: "Rookie card premium (+50–300%)" };
  return { mid: 1, low: 1, high: 1, desc: "Non-rookie" };
}

function getJerseyMatchBonus(serialNumber?: string, playerJersey?: string) {
  if (!serialNumber || !playerJersey) return { bonus: 1, desc: "" };
  const sn = String(serialNumber).trim();
  const pj = String(playerJersey).trim();
  if (sn === pj)
    return {
      bonus: 1.8,
      desc: `Jersey # match (${serialNumber}/${playerJersey}) — ~80% premium`,
    };
  const pr = parseInt(serialNumber);
  if (pr === 1) return { bonus: 1.08, desc: "#1 bookend serial — ~8% premium" };
  return { bonus: 1, desc: "" };
}

function getMarketTrend(sport: string): string {
  const trends: Record<string, string> = {
    basketball:
      "Bull market +43% YTD. Jordan/Kobe/LeBron Logomans driving ultra-high-end. Wembanyama rookies hot.",
    baseball:
      "Solid +24% YTD. Ohtani Logoman $3M record. Paul Skenes debut patch $1.1M.",
    football:
      "+24% YTD. QB-centric. Jayden Daniels Black Finite $500K. Mahomes steady.",
    hockey:
      "+14% YTD. McDavid shield $305K. Lane Hutson emerging. Bedard autos strong.",
    soccer:
      "Fastest growing +91% YTD. Messi PSA 10 $1.5M. Lamine Yamal SuperFractor $396K.",
    pokemon:
      "Explosive +85% YTD. Prismatic Evolutions driving demand. Umbreon ex hitting $2,640+.",
    wnba: "Caitlin Clark Logowoman $660K. Women's cards emerging as investment class.",
    other_tcg: "Mixed. One Piece strong (+30%). MTG vintage stable.",
    combat: "Niche but stable. Ali/Tyson vintage holds value.",
    golf: "Very niche. Tiger Woods exception approaches NBA star levels.",
  };
  return trends[sport] || "Market data not available for this category.";
}

function calculateValuation(input: CardInput): ValuationResult {
  const notes: string[] = [];
  const breakdown: MultiplierBreakdown[] = [];

  const serial = getSerialMultiplier(input.printRun);
  const grade = getGradeMultiplier(input.grader, input.grade);
  const auto = getAutoMultiplier(input.autoType);
  const playerTier = getPlayerTierMultiplier(input.playerTier);
  const brand = getBrandMultiplier(input.brandTier);
  const sport = getSportMultiplier(input.sport);
  const rookie = getRookiePremium(input.isRookie);
  const jersey = getJerseyMatchBonus(input.serialNumber, input.playerJersey);

  breakdown.push(
    { factor: "Serial / Print Run", multiplier: serial.mid, low: serial.low, high: serial.high, description: serial.desc },
    { factor: "Grade", multiplier: grade.mid, low: grade.low, high: grade.high, description: grade.desc },
    { factor: "Auto Type", multiplier: auto.mid, low: auto.low, high: auto.high, description: auto.desc },
    { factor: "Player Tier", multiplier: playerTier.mid, low: playerTier.low, high: playerTier.high, description: playerTier.desc },
    { factor: "Brand / Set", multiplier: brand.mid, low: brand.low, high: brand.high, description: brand.desc },
    { factor: "Sport", multiplier: sport.mid, low: sport.low, high: sport.high, description: sport.desc }
  );

  if (input.isRookie) {
    breakdown.push({
      factor: "Rookie Premium",
      multiplier: rookie.mid,
      low: rookie.low,
      high: rookie.high,
      description: rookie.desc,
    });
  }

  if (jersey.bonus > 1) {
    breakdown.push({
      factor: "Jersey # Match",
      multiplier: jersey.bonus,
      low: jersey.bonus * 0.8,
      high: jersey.bonus * 1.5,
      description: jersey.desc,
    });
    notes.push(jersey.desc);
  }

  const fmvMid =
    input.baseCardValue *
    serial.mid *
    grade.mid *
    auto.mid *
    rookie.mid *
    jersey.bonus;
  const fmvLow =
    input.baseCardValue *
    serial.low *
    grade.low *
    auto.low *
    rookie.low *
    (jersey.bonus > 1 ? jersey.bonus * 0.8 : 1);
  const fmvHigh =
    input.baseCardValue *
    serial.high *
    grade.high *
    auto.high *
    rookie.high *
    (jersey.bonus > 1 ? jersey.bonus * 1.5 : 1);

  const ebayFeeRate = 0.1325;
  const shippingCost = fmvMid > 100 ? 10 : 5.5;
  const supplyCost = 1;

  const optimalBin = fmvMid * 1.25;
  const optimalAuction = fmvMid * 0.95;

  const netBin = optimalBin * (1 - ebayFeeRate) - shippingCost - supplyCost;
  const netAuction =
    optimalAuction * (1 - ebayFeeRate) - shippingCost - supplyCost;

  const dealerOffer = fmvMid * 0.6;

  let confidence: "high" | "medium" | "low" = "high";
  const spread = fmvHigh / Math.max(fmvLow, 0.01);
  if (spread > 50) confidence = "low";
  else if (spread > 10) confidence = "medium";

  if (input.grader === "raw") {
    notes.push(
      "Raw cards: consider grading if condition is NM-MT or better. PSA 10 can multiply value 2.5-5x."
    );
  }
  if (input.autoType === "sticker") {
    notes.push(
      "On-card autos typically command ~45% premium over sticker autos for the same card."
    );
  }
  if (input.printRun === "1" || input.printRun === "1/1") {
    notes.push(
      "1/1 pricing is highly volatile and player-dependent. Always seek auction exposure for maximum value."
    );
  }
  if (
    parseInt(input.printRun) <= 10 &&
    parseInt(input.printRun) > 1
  ) {
    notes.push(
      `Low population serial (/${input.printRun}): check PSA/BGS pop reports — if pop 1-5 at this grade, significant additional premium.`
    );
  }

  const marketTrend = getMarketTrend(input.sport);

  return {
    estimatedFmv: Math.round(fmvMid * 100) / 100,
    optimalListBin: Math.round(optimalBin * 100) / 100,
    optimalListAuction: Math.round(optimalAuction * 100) / 100,
    netProceedsBin: Math.round(netBin * 100) / 100,
    netProceedsAuction: Math.round(netAuction * 100) / 100,
    dealerCashOffer: Math.round(dealerOffer * 100) / 100,
    breakdown,
    confidence,
    marketTrend,
    notes,
  };
}

// ============================================================
// GRADING RECOMMENDATION ENGINE
// ============================================================

// Grade-worthiness score: 1-10 scale
// 1-3: Do NOT grade (waste of money)
// 4-5: Marginal — only if condition is pristine
// 6-7: Worth grading — good ROI expected
// 8-9: Highly recommended — significant value unlock
// 10: Must grade — massive ROI potential

interface GradingInput {
  sport: string;
  playerTier: string;
  brandTier: string;
  printRun: string;
  grader: string;
  grade: string;
  autoType: string;
  isRookie: boolean;
  baseCardValue: number;
  fmv: number;
}

interface GradingRecommendation {
  score: number;            // 1-10 grade-worthiness
  verdict: string;          // "Must Grade" | "Highly Recommended" | "Worth Grading" | "Marginal" | "Do Not Grade" | "Already Graded"
  reasoning: string[];      // Why this score
  suggestedGrader: string;  // "PSA" | "BGS" | "SGC" | "CGC"
  graderReasoning: string;  // Why this grader
  estimatedCost: number;    // Grading cost estimate
  estimatedTimeWeeks: string; // Turnaround
  projectedGradedValue: number;  // If PSA 10
  projectedRoi: number;     // ROI percentage
  alternativeGraders: Array<{ name: string; pros: string; cost: number }>;
}

function calculateGradingRecommendation(input: GradingInput): GradingRecommendation {
  // Already graded — return that info
  if (input.grader !== "raw") {
    const crossoverInfo = getCrossoverAdvice(input.grader, input.grade, input.fmv);
    return {
      score: crossoverInfo.score,
      verdict: "Already Graded",
      reasoning: crossoverInfo.reasoning,
      suggestedGrader: crossoverInfo.suggestedGrader,
      graderReasoning: crossoverInfo.graderReasoning,
      estimatedCost: crossoverInfo.cost,
      estimatedTimeWeeks: crossoverInfo.time,
      projectedGradedValue: input.fmv,
      projectedRoi: 0,
      alternativeGraders: crossoverInfo.alternatives,
    };
  }

  // Scoring factors for raw cards
  let score = 0;
  const reasoning: string[] = [];

  // Factor 1: Current raw FMV (higher value = more worth grading)
  if (input.fmv >= 500) { score += 3; reasoning.push("High raw value ($500+) — grading adds significant premium and authentication"); }
  else if (input.fmv >= 100) { score += 2.5; reasoning.push("Solid raw value ($100+) — grading ROI is strong at this price point"); }
  else if (input.fmv >= 50) { score += 2; reasoning.push("Moderate raw value ($50+) — grading worthwhile if condition is strong"); }
  else if (input.fmv >= 20) { score += 1; reasoning.push("Low-moderate raw value ($20–50) — grading costs may eat into margin"); }
  else if (input.fmv >= 10) { score += 0.5; reasoning.push("Low raw value ($10–20) — grading ROI marginal unless PSA 10 likely"); }
  else { score += 0; reasoning.push("Very low raw value (under $10) — grading cost exceeds potential upside"); }

  // Factor 2: Player tier
  if (input.playerTier === "goat") { score += 2; reasoning.push("GOAT-tier player — graded premium is highest for iconic names"); }
  else if (input.playerTier === "superstar") { score += 1.5; reasoning.push("Superstar player — strong graded demand from collectors"); }
  else if (input.playerTier === "star") { score += 1; reasoning.push("Star-level player — decent graded market exists"); }
  else if (input.playerTier === "starter") { score += 0.3; reasoning.push("Starter-level player — limited graded premium unless breakout candidate"); }
  else { score += 0; reasoning.push("Common player — minimal graded premium in most cases"); }

  // Factor 3: Card type bonuses
  if (input.isRookie) { score += 1; reasoning.push("Rookie card — graded rookies command significantly higher premiums"); }
  if (input.autoType !== "none") { score += 0.5; reasoning.push("Autographed card — authentication via grading adds buyer confidence"); }
  const pr = parseInt(input.printRun);
  if (!isNaN(pr) && pr <= 99) { score += 0.5; reasoning.push(`Low print run (/${input.printRun}) — numbered cards benefit more from grade authentication`); }
  if (input.brandTier === "premium" || input.brandTier === "upper_mid") { score += 0.5; reasoning.push("Premium/upper-mid brand — collectors expect grading on high-end product"); }

  // Factor 4: PSA 10 multiplier potential
  const psa10Multi = 3.5; // From grade multiplier engine
  const projectedPsa10Value = input.fmv * psa10Multi;
  const gradingCost = getGradingCost(input.fmv);
  const roi = ((projectedPsa10Value - input.fmv - gradingCost) / (input.fmv + gradingCost)) * 100;

  if (roi >= 200) { score += 1; reasoning.push(`Excellent ROI potential — PSA 10 could be worth ${formatCurrencyServer(projectedPsa10Value)} (${Math.round(roi)}% ROI)`); }
  else if (roi >= 100) { score += 0.5; reasoning.push(`Good ROI potential — PSA 10 could be worth ${formatCurrencyServer(projectedPsa10Value)} (${Math.round(roi)}% ROI)`); }
  else if (roi >= 25) { reasoning.push(`Moderate ROI — PSA 10 could be worth ${formatCurrencyServer(projectedPsa10Value)} (${Math.round(roi)}% ROI)`); }
  else { reasoning.push(`Low ROI — PSA 10 projected at ${formatCurrencyServer(projectedPsa10Value)} (${Math.round(roi)}% ROI after grading cost)`); }

  // Clamp score
  score = Math.min(10, Math.max(1, Math.round(score * 10) / 10));

  // Determine verdict
  let verdict: string;
  if (score >= 9) verdict = "Must Grade";
  else if (score >= 7) verdict = "Highly Recommended";
  else if (score >= 5) verdict = "Worth Grading";
  else if (score >= 3) verdict = "Marginal";
  else verdict = "Do Not Grade";

  // Pick the best grader
  const { grader, graderReasoning, alternatives } = pickBestGrader(input);
  const cost = getGradingCost(input.fmv);

  return {
    score,
    verdict,
    reasoning,
    suggestedGrader: grader,
    graderReasoning,
    estimatedCost: cost,
    estimatedTimeWeeks: getGradingTurnaround(cost),
    projectedGradedValue: Math.round(projectedPsa10Value),
    projectedRoi: Math.round(roi),
    alternativeGraders: alternatives,
  };
}

function getGradingCost(fmv: number): number {
  // PSA pricing tiers (2025-2026)
  if (fmv >= 10000) return 600;  // Super Express
  if (fmv >= 2500) return 300;   // Express
  if (fmv >= 500) return 150;    // Regular
  if (fmv >= 100) return 75;     // Economy
  return 35;                      // Value tier
}

function getGradingTurnaround(cost: number): string {
  if (cost >= 600) return "2-5 business days";
  if (cost >= 300) return "5-10 business days";
  if (cost >= 150) return "15-30 business days";
  if (cost >= 75) return "30-60 business days";
  return "60-120 business days";
}

function pickBestGrader(input: GradingInput): {
  grader: string;
  graderReasoning: string;
  alternatives: Array<{ name: string; pros: string; cost: number }>;
} {
  const alternatives: Array<{ name: string; pros: string; cost: number }> = [];

  // Pokemon / TCG → CGC or PSA
  if (input.sport === "pokemon" || input.sport === "other_tcg") {
    alternatives.push(
      { name: "PSA", pros: "Highest resale premium, most recognized globally for Pokemon", cost: getGradingCost(input.fmv) },
      { name: "CGC", pros: "Subgrades included, excellent for modern Pokemon, growing acceptance", cost: Math.round(getGradingCost(input.fmv) * 0.85) },
      { name: "BGS", pros: "Beckett Black Label 10 commands extreme premium on chase cards", cost: Math.round(getGradingCost(input.fmv) * 1.1) },
    );
    if (input.fmv >= 200 || input.playerTier === "goat" || input.playerTier === "superstar") {
      return {
        grader: "PSA",
        graderReasoning: "PSA dominates Pokemon resale value. PSA 10 commands 20-40% premium over CGC 10 on high-end Pokemon cards. Best choice for chase cards and investment-grade Pokemon.",
        alternatives: alternatives.filter(a => a.name !== "PSA"),
      };
    }
    return {
      grader: "CGC",
      graderReasoning: "CGC offers great value for modern Pokemon/TCG — subgrades included at lower cost. For cards under $200, the PSA premium doesn't always justify the price difference.",
      alternatives: alternatives.filter(a => a.name !== "CGC"),
    };
  }

  // Vintage (pre-2000 sports cards) → PSA or SGC
  const year = parseInt(input.printRun === "unlimited" ? "2020" : "2020"); // Use sport context
  const isLikelyVintage = input.brandTier === "premium" && input.playerTier === "goat";

  if (isLikelyVintage) {
    alternatives.push(
      { name: "PSA", pros: "Industry standard for vintage, highest liquidity and resale", cost: getGradingCost(input.fmv) },
      { name: "SGC", pros: "Excellent holder aesthetic, respected for vintage, lower cost", cost: Math.round(getGradingCost(input.fmv) * 0.7) },
      { name: "BGS", pros: "Subgrades provide detailed condition breakdown", cost: Math.round(getGradingCost(input.fmv) * 1.1) },
    );
    return {
      grader: "PSA",
      graderReasoning: "PSA is the gold standard for high-value and vintage cards. Highest resale liquidity — PSA holders sell for 10-25% more than equivalent SGC grades on the secondary market.",
      alternatives: alternatives.filter(a => a.name !== "PSA"),
    };
  }

  // Modern sports cards (default path)
  alternatives.push(
    { name: "PSA", pros: "Highest resale value, most recognized globally, largest buyer pool", cost: getGradingCost(input.fmv) },
    { name: "BGS", pros: "Subgrades included, Black Label 10 worth 2-4x PSA 10, best for pristine modern cards", cost: Math.round(getGradingCost(input.fmv) * 1.1) },
    { name: "SGC", pros: "Fastest turnaround, lowest cost, excellent tuxedo holder, growing market share", cost: Math.round(getGradingCost(input.fmv) * 0.7) },
    { name: "CGC", pros: "Newest grader, competitive pricing, subgrades included", cost: Math.round(getGradingCost(input.fmv) * 0.85) },
  );

  // High-value modern → PSA
  if (input.fmv >= 200 || input.playerTier === "goat" || input.playerTier === "superstar") {
    return {
      grader: "PSA",
      graderReasoning: "PSA is the best choice for high-value modern cards. Largest buyer pool, highest resale premium (10-25% over SGC, 15-30% over CGC). The market standard for investment-grade cards.",
      alternatives: alternatives.filter(a => a.name !== "PSA"),
    };
  }

  // Budget-friendly grading → SGC
  if (input.fmv < 50) {
    return {
      grader: "SGC",
      graderReasoning: "SGC is the best value grader for sub-$50 cards. Lowest cost (~$22-30), fastest turnaround, and the tuxedo holder is a collector favorite. SGC is rapidly gaining market share.",
      alternatives: alternatives.filter(a => a.name !== "SGC"),
    };
  }

  // Mid-range → PSA (default) but mention BGS for pristine
  return {
    grader: "PSA",
    graderReasoning: "PSA is the safe default for mid-range cards. If you believe the card is a perfect 10, consider BGS — a Black Label BGS 10 can be worth 2-4x a PSA 10.",
    alternatives: alternatives.filter(a => a.name !== "PSA"),
  };
}

function getCrossoverAdvice(currentGrader: string, grade: string, fmv: number) {
  const reasoning: string[] = [];
  let score = 5;
  let suggestedGrader = currentGrader.toUpperCase();
  let graderReasoning = "Card is already graded — no action needed.";
  const alternatives: Array<{ name: string; pros: string; cost: number }> = [];
  const cost = 25; // crossover cost
  const time = "15-30 business days";
  const g = grade.toLowerCase();

  // SGC/CGC → PSA crossover often makes sense for high grades
  if ((currentGrader === "sgc" || currentGrader === "cgc") && (g === "10" || g === "9.5")) {
    score = 7;
    suggestedGrader = "PSA";
    graderReasoning = `Crossover to PSA recommended — PSA ${g === "10" ? "10" : "10"} commands 15-30% premium over ${currentGrader.toUpperCase()} ${grade}. Worth the crossover fee.`;
    reasoning.push(`${currentGrader.toUpperCase()} ${grade} is strong — PSA crossover could unlock 15-30% more value`);
    reasoning.push("PSA has the largest buyer pool and highest resale liquidity");
    alternatives.push({ name: currentGrader.toUpperCase(), pros: "Already graded, keep current holder", cost: 0 });
    alternatives.push({ name: "BGS", pros: "Crossover to BGS for subgrades, Black Label potential", cost: 25 });
  } else if (currentGrader === "bgs" && g === "9.5") {
    score = 4;
    reasoning.push("BGS 9.5 is respected — crossover to PSA only if buyer pool prefers PSA in your market");
    reasoning.push("If subgrades are all 9.5+, may qualify for BGS 10 regrade instead");
  } else {
    score = 3;
    reasoning.push(`Card is already ${currentGrader.toUpperCase()} ${grade} — typically not worth re-grading`);
    reasoning.push("Re-grading risks receiving a lower grade and losing value");
  }

  return { score, reasoning, suggestedGrader, graderReasoning, cost, time, alternatives };
}

// ============================================================
// SELLING PLATFORM RECOMMENDATION ENGINE
// ============================================================

interface SellingInput {
  sport: string;
  playerTier: string;
  brandTier: string;
  printRun: string;
  grader: string;
  autoType: string;
  isRookie: boolean;
  fmv: number;
}

interface PlatformRecommendation {
  name: string;
  score: number;        // 1-10 fit score
  fees: string;         // Fee description
  feePercent: number;   // Effective fee %
  netProceeds: number;  // Estimated net at FMV
  pros: string[];
  cons: string[];
  bestFor: string;      // One-liner about when to use
  url: string;
}

interface SellingRecommendation {
  primary: PlatformRecommendation;
  alternatives: PlatformRecommendation[];
  strategy: string;     // Sell now vs. hold advice
  formatAdvice: string; // Auction vs. BIN vs. Best Offer
}

function calculateSellingRecommendation(input: SellingInput): SellingRecommendation {
  const platforms: PlatformRecommendation[] = [];

  // eBay
  const ebayFee = input.fmv >= 7500 ? 0.0635 : 0.1325; // store vs non-store, high-value discount
  const ebayNet = input.fmv * (1 - ebayFee) - (input.fmv > 100 ? 10 : 5.5);
  let ebayScore = 7; // baseline
  const ebayPros = ["Largest buyer pool globally", "Auction format for price discovery", "Best Offer for negotiation"];
  const ebayCons = ["13.25% fee (non-store)", "Shipping risk", "Buyer returns/disputes"];
  if (input.fmv >= 500) { ebayScore += 1; ebayPros.push("High-value cards get maximum exposure"); }
  if (input.fmv >= 5000) { ebayScore += 1; ebayPros.push("Vault shipping for $5K+ cards"); ebayCons[0] = "6.35% fee over $7,500"; }
  if (input.playerTier === "goat" || input.playerTier === "superstar") { ebayScore += 0.5; }
  if (input.autoType !== "none") { ebayScore += 0.5; ebayPros.push("Auto collectors heavily use eBay"); }
  platforms.push({
    name: "eBay",
    score: Math.min(10, ebayScore),
    fees: input.fmv >= 7500 ? "6.35% over $7,500" : "13.25% (non-store) / 12.35% (store)",
    feePercent: ebayFee * 100,
    netProceeds: Math.round(ebayNet * 100) / 100,
    pros: ebayPros,
    cons: ebayCons,
    bestFor: "Highest exposure and price discovery for any card over $50",
    url: "https://www.ebay.com/sl/sell",
  });

  // COMC (Check Out My Cards)
  const comcFee = 0.05 + 0.025; // 5% sale + 2.5% processing
  const comcNet = input.fmv * (1 - comcFee) - 2; // $2 processing per card
  let comcScore = 5;
  const comcPros = ["Low 5% commission + 2.5% processing", "Professional photography and scanning", "Built-in price comparison tools"];
  const comcCons = ["Slower sales velocity", "Must ship cards to COMC first", "Smaller buyer pool than eBay"];
  if (input.fmv >= 20 && input.fmv <= 200) { comcScore += 2; comcPros.push("Sweet spot for $20-200 cards — low fees maximize margin"); }
  if (input.sport === "baseball" || input.sport === "football") { comcScore += 1; comcPros.push("Strong baseball/football collector base"); }
  platforms.push({
    name: "COMC",
    score: Math.min(10, comcScore),
    fees: "5% commission + 2.5% processing",
    feePercent: 7.5,
    netProceeds: Math.round(comcNet * 100) / 100,
    pros: comcPros,
    cons: comcCons,
    bestFor: "Best for mid-range cards ($20-200) where eBay fees eat into margins",
    url: "https://www.comc.com",
  });

  // TCGPlayer (Pokemon / MTG / Yu-Gi-Oh)
  if (input.sport === "pokemon" || input.sport === "other_tcg") {
    const tcgFee = input.fmv >= 500 ? 0.089 : 0.1135; // Pro vs standard
    const tcgNet = input.fmv * (1 - tcgFee) - 3;
    let tcgScore = 8;
    const tcgPros = ["#1 marketplace for TCG cards", "Built-in pricing data", "Dedicated TCG buyer audience"];
    const tcgCons = ["11.35% fee (standard) / 8.9% (Pro)", "Only for TCG cards", "Requires seller verification"];
    if (input.sport === "pokemon") { tcgScore += 1; tcgPros.push("Pokemon-specific search and filtering"); }
    platforms.push({
      name: "TCGPlayer",
      score: Math.min(10, tcgScore),
      fees: input.fmv >= 500 ? "8.9% (Pro seller)" : "11.35% (standard)",
      feePercent: tcgFee * 100,
      netProceeds: Math.round(tcgNet * 100) / 100,
      pros: tcgPros,
      cons: tcgCons,
      bestFor: "The go-to marketplace for Pokemon and TCG cards — dedicated buyer base",
      url: "https://www.tcgplayer.com",
    });
  }

  // MySlabs
  let myslabsScore = 4;
  const myslabsFee = 0.09;
  const myslabsNet = input.fmv * (1 - myslabsFee);
  const myslabsPros = ["9% flat fee — lower than eBay", "Graded card specialist marketplace", "No shipping risk (vault option)"];
  const myslabsCons = ["Smaller buyer pool", "Requires graded cards only", "Newer platform, less established"];
  if (input.grader !== "raw") { myslabsScore += 2; myslabsPros.push("Purpose-built for slabbed cards"); }
  if (input.fmv >= 100) { myslabsScore += 1; }
  platforms.push({
    name: "MySlabs",
    score: Math.min(10, myslabsScore),
    fees: "9% flat fee",
    feePercent: 9,
    netProceeds: Math.round(myslabsNet * 100) / 100,
    pros: myslabsPros,
    cons: myslabsCons,
    bestFor: "Best alternative to eBay for graded cards — lower fees, card-specific audience",
    url: "https://www.myslabs.com",
  });

  // Facebook Groups / Direct Sale
  const fbScore = input.fmv >= 50 ? 6 : 3;
  const fbNet = input.fmv * 0.97; // 3% G&S
  platforms.push({
    name: "Facebook Groups",
    score: fbScore,
    fees: "0% marketplace fee (PayPal G&S ~3%)",
    feePercent: 3,
    netProceeds: Math.round(fbNet * 100) / 100,
    pros: ["Lowest fees (just PayPal G&S 3%)", "Direct negotiation", "Niche groups for every sport/set", "Fast sales for popular cards"],
    cons: ["Scam risk higher", "No buyer protection", "Manual process", "Need reputation/references"],
    bestFor: "Lowest fees possible — best for sellers with established reputation in card groups",
    url: "https://www.facebook.com/groups",
  });

  // Goldin Auctions (high-end)
  if (input.fmv >= 500) {
    const goldinFee = 0.10; // ~10% seller + buyer premium
    const goldinNet = input.fmv * (1 - goldinFee);
    let goldinScore = 6;
    if (input.fmv >= 5000) { goldinScore = 9; }
    else if (input.fmv >= 1000) { goldinScore = 7; }
    platforms.push({
      name: "Goldin Auctions",
      score: goldinScore,
      fees: "~10% seller premium (varies)",
      feePercent: 10,
      netProceeds: Math.round(goldinNet * 100) / 100,
      pros: ["Premier auction house for high-end cards", "Massive collector audience", "Professional photography/marketing", "Record-breaking sales history"],
      cons: ["$500+ minimum value", "Consignment process takes weeks", "Seller premium negotiable"],
      bestFor: "The premier auction house for cards $1,000+ — maximum exposure to high-net-worth collectors",
      url: "https://goldin.co",
    });
  }

  // PWCC (high-end)
  if (input.fmv >= 250) {
    const pwccFee = 0.08;
    const pwccNet = input.fmv * (1 - pwccFee);
    let pwccScore = 5;
    if (input.fmv >= 2500) { pwccScore = 8; }
    else if (input.fmv >= 500) { pwccScore = 7; }
    platforms.push({
      name: "PWCC Marketplace",
      score: pwccScore,
      fees: "~8% seller fee",
      feePercent: 8,
      netProceeds: Math.round(pwccNet * 100) / 100,
      pros: ["Vaulted storage option", "Weekly auction events", "Strong high-end collector base", "8% seller fee competitive"],
      cons: ["Must ship cards to PWCC vault", "Minimum value thresholds", "Sales cycle tied to auction schedule"],
      bestFor: "Vault + auction model — great for high-end graded cards you want to sell on a schedule",
      url: "https://www.pwccmarketplace.com",
    });
  }

  // Sort by score descending
  platforms.sort((a, b) => b.score - a.score);

  const primary = platforms[0];
  const alternatives = platforms.slice(1);

  // Selling strategy advice
  let strategy: string;
  if (input.fmv >= 1000 && (input.playerTier === "goat" || input.playerTier === "superstar")) {
    strategy = "HOLD if possible — market is in a bull phase. High-end cards trending up 25-40% YTD. Consider consigning to Goldin or PWCC for maximum auction exposure when ready to sell.";
  } else if (input.fmv >= 200) {
    strategy = "Sell now or hold — current market is strong. If selling, eBay auction ending on Sunday evening gets maximum bids. List with Best Offer for BIN with negotiation room.";
  } else if (input.fmv >= 50) {
    strategy = "Sell now — mid-range cards are best sold while market is hot. eBay BIN with Best Offer or COMC for hands-off selling.";
  } else {
    strategy = "Sell now — low-value cards should be moved quickly. Consider lot sales (grouping 5-10 similar cards) to increase per-transaction value and reduce shipping costs per card.";
  }

  // Format advice
  let formatAdvice: string;
  if (input.fmv >= 1000) {
    formatAdvice = "Auction (7-day, ending Sunday 7-10 PM ET) — price discovery maximizes value on high-end cards. Start at 60-70% of FMV to drive bidding.";
  } else if (input.fmv >= 200) {
    formatAdvice = "BIN + Best Offer — list at 125% FMV with auto-accept at 90% FMV and auto-decline below 70% FMV. Promoted listing at 2-3% for extra visibility.";
  } else if (input.fmv >= 50) {
    formatAdvice = "BIN + Best Offer — list at FMV + 15-20%. Accept offers at 85%+ of FMV. Free shipping builds into price.";
  } else {
    formatAdvice = "BIN fixed price — low-value cards don't attract auction bids. Price at market value + shipping. Consider multi-card lots.";
  }

  return {
    primary,
    alternatives,
    strategy,
    formatAdvice,
  };
}

function formatCurrencyServer(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
  if (value >= 1000) return `$${value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  return `$${value.toFixed(2)}`;
}

function csvSafe(s: string): string {
  if (!s) return "";
  if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
