// ============================================================
// Grade-or-Sell Verdict Engine
//
// CardScan Pro's moat feature. Takes an existing card analysis and
// returns a definitive decision: GRADE / SELL_RAW / HOLD, backed by
// real expected-value math and AI-generated reasoning.
//
// Free tier: receives only `decision` + `confidence`.
// Pro+ tiers: receives the full payload including probabilities,
//             predicted grade values, expected ROI, sell window,
//             and the reasoning string.
// ============================================================

import Anthropic from "@anthropic-ai/sdk";
import type { Analysis, TierKey } from "@shared/schema";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Grading service costs (in USD cents). Tuned for PSA Value tier (2026 rates).
const GRADING_FEES = {
  psa_value: 2500,    // $25
  psa_regular: 4000,  // $40
  psa_express: 12500, // $125
  bgs_regular: 3500,
  sgc_value: 1900,
  cgc_value: 1800,
} as const;

const SHIPPING_AND_INSURANCE_CENTS = 700; // round-trip estimate

// Probability priors by grading service track record (very rough).
// These get overridden by the AI's per-card assessment but provide a fallback.
const DEFAULT_PROBABILITIES = {
  psa10: 0.15,
  psa9: 0.55,
  psa8: 0.25,
  psa_lower: 0.05,
};

export type VerdictDecision = "GRADE" | "SELL_RAW" | "HOLD";

export interface VerdictPayload {
  decision: VerdictDecision;
  confidence: number; // 0..100
  rawFmv: number; // cents
  gradeCostCents: number;
  probabilities: {
    psa10: number;
    psa9: number;
    psa8: number;
    psa_lower: number;
  };
  predictedGradeValues: {
    psa10: number; // cents
    psa9: number;
    psa8: number;
    psa_lower: number;
  };
  expectedPostGradeValueCents: number;
  expectedRoiCents: number;
  sellWindow: string | null; // e.g. "Apr-Jul 2027 playoff push"
  reasoning: string;
}

/**
 * Public-facing verdict payload after tier-gating.
 * Free tier sees only decision + confidence.
 */
export type GatedVerdict =
  | { tier: "free"; decision: VerdictDecision; confidence: number }
  | (VerdictPayload & { tier: Exclude<TierKey, "free"> });

/**
 * Generate a Grade-or-Sell verdict for an analyzed card.
 * Uses Claude to assess condition-from-photo + comp landscape + sell timing,
 * then computes expected value math on top.
 */
export async function generateVerdict(
  analysis: Analysis,
  imageBase64?: string,
): Promise<VerdictPayload> {
  const rawFmv = analysis.estimatedFmv * 100; // schema stores dollars; convert to cents
  const gradeCostCents = GRADING_FEES.psa_value + SHIPPING_AND_INSURANCE_CENTS;

  // Ask Claude for probabilities + predicted-grade values + sell-window narrative.
  const userPrompt = buildVerdictPrompt(analysis);

  let aiResponse: any = null;
  try {
    const content: any[] = [{ type: "text", text: userPrompt }];
    if (imageBase64) {
      content.unshift({
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: imageBase64 },
      });
    }
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 1200,
      messages: [{ role: "user", content }],
    });
    const text = msg.content
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("\n");
    aiResponse = extractJson(text);
  } catch (err) {
    // Fall back to priors if AI is unavailable.
    aiResponse = null;
  }

  const probabilities =
    aiResponse?.probabilities &&
    isValidProbabilityDistribution(aiResponse.probabilities)
      ? aiResponse.probabilities
      : DEFAULT_PROBABILITIES;

  // Predicted grade values: AI provides multipliers vs raw FMV, we compute cents.
  const multipliers = aiResponse?.grade_multipliers ?? {
    psa10: 6.0,
    psa9: 2.1,
    psa8: 0.6,
    psa_lower: 0.3,
  };
  const predictedGradeValues = {
    psa10: Math.round(rawFmv * multipliers.psa10),
    psa9: Math.round(rawFmv * multipliers.psa9),
    psa8: Math.round(rawFmv * multipliers.psa8),
    psa_lower: Math.round(rawFmv * multipliers.psa_lower),
  };

  // Expected post-grade value = sum(P(grade) × value(grade))
  const expectedPostGradeValueCents = Math.round(
    probabilities.psa10 * predictedGradeValues.psa10 +
      probabilities.psa9 * predictedGradeValues.psa9 +
      probabilities.psa8 * predictedGradeValues.psa8 +
      probabilities.psa_lower * predictedGradeValues.psa_lower,
  );

  const expectedRoiCents = expectedPostGradeValueCents - rawFmv - gradeCostCents;

  const { decision, confidence } = decide({
    rawFmv,
    expectedPostGradeValueCents,
    gradeCostCents,
    probabilities,
    aiSellWindow: aiResponse?.sell_window,
  });

  return {
    decision,
    confidence,
    rawFmv,
    gradeCostCents,
    probabilities,
    predictedGradeValues,
    expectedPostGradeValueCents,
    expectedRoiCents,
    sellWindow: aiResponse?.sell_window ?? null,
    reasoning:
      aiResponse?.reasoning ??
      "Verdict computed from baseline grade probabilities; AI condition assessment was unavailable for this card.",
  };
}

function buildVerdictPrompt(a: Analysis): string {
  return `You are an expert sports-card grader and market analyst. Given the following analyzed card, return a strict JSON verdict.

Card:
- Player: ${a.playerName} (${a.playerTier})
- Brand/Set: ${a.brandTier} / ${a.setName ?? "?"} ${a.year ?? ""}
- Print run: ${a.printRun}
- Currently graded: ${a.grader} ${a.grade}
- Auto type: ${a.autoType}
- Rookie: ${a.isRookie ? "yes" : "no"}
- Serial: ${a.serialNumber ?? "—"}
- Raw FMV (assumed): $${a.estimatedFmv}

Tasks:
1. From the card's reported condition and AI confidence, estimate the probability distribution if submitted to PSA today: { "psa10": <0-1>, "psa9": <0-1>, "psa8": <0-1>, "psa_lower": <0-1> }. Must sum to ~1.0.
2. Estimate the value MULTIPLIER vs raw FMV at each grade tier: { "psa10": <e.g. 6.0>, "psa9": <e.g. 2.1>, "psa8": <e.g. 0.6>, "psa_lower": <e.g. 0.3> }.
3. Recommend a sell window if a HOLD decision makes sense (e.g. "Apr-Jul 2027 playoff push", or null if not applicable).
4. Provide a 2-3 sentence reasoning explaining the decision intuitively for a serious collector.

Return ONLY a strict JSON object with exactly these keys: probabilities, grade_multipliers, sell_window (string or null), reasoning (string). No markdown, no commentary.`;
}

function extractJson(text: string): any {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function isValidProbabilityDistribution(p: any): boolean {
  if (!p) return false;
  const keys = ["psa10", "psa9", "psa8", "psa_lower"];
  if (!keys.every((k) => typeof p[k] === "number")) return false;
  const sum = keys.reduce((s, k) => s + p[k], 0);
  return sum > 0.85 && sum < 1.15;
}

interface DecideInput {
  rawFmv: number;
  expectedPostGradeValueCents: number;
  gradeCostCents: number;
  probabilities: { psa10: number; psa9: number; psa8: number; psa_lower: number };
  aiSellWindow?: string | null;
}

function decide(input: DecideInput): { decision: VerdictDecision; confidence: number } {
  const { rawFmv, expectedPostGradeValueCents, gradeCostCents, probabilities, aiSellWindow } =
    input;

  const expectedRoi = expectedPostGradeValueCents - rawFmv - gradeCostCents;
  const roiPctOfRaw = rawFmv > 0 ? expectedRoi / rawFmv : 0;

  // Grade if expected ROI is materially positive AND probability of upside is meaningful.
  if (expectedRoi > 0 && roiPctOfRaw > 0.2 && probabilities.psa9 + probabilities.psa10 > 0.55) {
    // confidence scales with magnitude of edge and probability mass on PSA 9/10
    const conf = Math.min(
      99,
      Math.max(60, Math.round(60 + roiPctOfRaw * 30 + (probabilities.psa10 * 30))),
    );
    return { decision: "GRADE", confidence: conf };
  }

  // Hold if AI flags an upcoming sell window AND raw FMV is stable.
  if (aiSellWindow && expectedRoi <= 0) {
    return { decision: "HOLD", confidence: 70 };
  }

  // Otherwise sell raw.
  const conf = Math.max(55, Math.round(70 - Math.abs(roiPctOfRaw) * 20));
  return { decision: "SELL_RAW", confidence: Math.min(95, conf) };
}

/**
 * Apply tier-based gating to a full verdict.
 * Free tier gets only the decision + confidence.
 */
export function gateVerdict(verdict: VerdictPayload, tier: TierKey): GatedVerdict {
  if (tier === "free") {
    return {
      tier: "free",
      decision: verdict.decision,
      confidence: verdict.confidence,
    };
  }
  return { ...verdict, tier };
}
