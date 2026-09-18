import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted to ensure the mock is available before vi.mock executes
const { mockCreate } = vi.hoisted(() => {
  return { mockCreate: vi.fn() };
});

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: vi.fn().mockImplementation(() => {
      return {
        messages: {
          create: mockCreate,
        },
      };
    }),
  };
});

import { generateVerdict } from "./verdict";
import type { Analysis } from "@shared/schema";

describe("generateVerdict", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseAnalysis: Analysis = {
    id: 1,
    userId: 1,
    folderId: null,
    imageUrl: "test.jpg",
    playerName: "Michael Jordan",
    playerTier: 1,
    brandTier: 1,
    setName: "Fleer",
    year: "1986",
    printRun: 0,
    grader: "Raw",
    grade: null,
    autoType: "none",
    isRookie: true,
    serialNumber: null,
    estimatedFmv: 100, // $100
    createdAt: new Date(),
  };

  describe("happy path", () => {
    it("should return a GRADE decision when expected ROI is positive and probabilities favor high grades", async () => {
      mockCreate.mockResolvedValue({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              // Highly favors a PSA 10/9
              probabilities: { psa10: 0.3, psa9: 0.6, psa8: 0.1, psa_lower: 0.0 },
              // Large multipliers
              grade_multipliers: { psa10: 10.0, psa9: 3.0, psa8: 1.0, psa_lower: 0.5 },
              sell_window: null,
              reasoning: "Excellent condition card with huge upside.",
            })
          }
        ]
      });

      const result = await generateVerdict(baseAnalysis);

      expect(mockCreate).toHaveBeenCalled();

      expect(result.decision).toBe("GRADE");
      expect(result.reasoning).toBe("Excellent condition card with huge upside.");
      expect(result.rawFmv).toBe(100 * 100); // 10000 cents

      // Calculate expected expectedPostGradeValueCents
      // $100 raw FMV * 10.0 * 0.3 = $300
      // $100 raw FMV * 3.0 * 0.6 = $180
      // $100 raw FMV * 1.0 * 0.1 = $10
      // $100 raw FMV * 0.5 * 0.0 = $0
      // Total expected value = $490 (49000 cents)
      expect(result.expectedPostGradeValueCents).toBe(49000);

      // Cost to grade: 2500 (psa_value) + 700 (shipping) = 3200
      expect(result.gradeCostCents).toBe(3200);

      // ROI = Expected Value - Raw FMV - Grading Cost
      // 49000 - 10000 - 3200 = 35800
      expect(result.expectedRoiCents).toBe(35800);
      expect(result.confidence).toBeGreaterThan(60);
    });

    it("should return a SELL_RAW decision when expected ROI is poor", async () => {
      mockCreate.mockResolvedValue({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              // Poor probability of PSA 9/10
              probabilities: { psa10: 0.05, psa9: 0.15, psa8: 0.5, psa_lower: 0.3 },
              // Poor multipliers
              grade_multipliers: { psa10: 2.0, psa9: 1.2, psa8: 0.8, psa_lower: 0.3 },
              sell_window: null,
              reasoning: "Card is visibly damaged, poor grading candidate.",
            })
          }
        ]
      });

      const result = await generateVerdict(baseAnalysis);

      expect(result.decision).toBe("SELL_RAW");
      expect(result.reasoning).toBe("Card is visibly damaged, poor grading candidate.");

      // ROI should be negative, hence it chooses SELL_RAW
      expect(result.expectedRoiCents).toBeLessThan(0);
    });
  });

  describe("fallback path", () => {
    it("should use default probabilities and multipliers if AI response is invalid json", async () => {
      mockCreate.mockResolvedValue({
        content: [
          {
            type: "text",
            text: "This is not JSON at all."
          }
        ]
      });

      const result = await generateVerdict(baseAnalysis);

      expect(result.probabilities).toEqual({
        psa10: 0.15,
        psa9: 0.55,
        psa8: 0.25,
        psa_lower: 0.05,
      });
      expect(result.predictedGradeValues).toEqual({
        psa10: 60000,
        psa9: 21000,
        psa8: 6000,
        psa_lower: 3000,
      });

      expect(result.expectedPostGradeValueCents).toBe(22200);
      expect(result.reasoning).toBe("Verdict computed from baseline grade probabilities; AI condition assessment was unavailable for this card.");
    });

    it("should use default probabilities if AI probabilities sum is way off", async () => {
      mockCreate.mockResolvedValue({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              probabilities: { psa10: 0.1, psa9: 0.1, psa8: 0.1, psa_lower: 0.1 }, // sums to 0.4, invalid
              grade_multipliers: { psa10: 10.0, psa9: 3.0, psa8: 1.0, psa_lower: 0.5 },
            })
          }
        ]
      });

      const result = await generateVerdict(baseAnalysis);

      expect(result.probabilities).toEqual({
        psa10: 0.15,
        psa9: 0.55,
        psa8: 0.25,
        psa_lower: 0.05,
      });

      expect(result.predictedGradeValues).toEqual({
        psa10: 100000,
        psa9: 30000,
        psa8: 10000,
        psa_lower: 5000,
      });
    });

    it("should fallback when Anthropic API throws an error", async () => {
      mockCreate.mockRejectedValue(new Error("Anthropic API Error"));

      const result = await generateVerdict(baseAnalysis);

      expect(result.probabilities).toEqual({
        psa10: 0.15,
        psa9: 0.55,
        psa8: 0.25,
        psa_lower: 0.05,
      });
      expect(result.reasoning).toBe("Verdict computed from baseline grade probabilities; AI condition assessment was unavailable for this card.");
    });
  });

  describe("HOLD decision", () => {
    it("should return HOLD if there is a sell window but ROI is poor", async () => {
      mockCreate.mockResolvedValue({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              probabilities: { psa10: 0.05, psa9: 0.15, psa8: 0.5, psa_lower: 0.3 }, // Poor condition
              grade_multipliers: { psa10: 2.0, psa9: 1.2, psa8: 0.8, psa_lower: 0.3 }, // Poor multipliers -> negative ROI
              sell_window: "Wait for documentary next month",
              reasoning: "Not worth grading, but has upcoming hype.",
            })
          }
        ]
      });

      const result = await generateVerdict(baseAnalysis);

      expect(result.decision).toBe("HOLD");
      expect(result.sellWindow).toBe("Wait for documentary next month");
      expect(result.reasoning).toBe("Not worth grading, but has upcoming hype.");
      expect(result.expectedRoiCents).toBeLessThan(0); // confirms why it's not GRADE
    });
  });
});
