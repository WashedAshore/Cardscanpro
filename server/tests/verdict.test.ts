import { describe, it, expect } from "vitest";
import { gateVerdict, VerdictPayload } from "../verdict";

describe("gateVerdict", () => {
  const fullVerdict: VerdictPayload = {
    decision: "GRADE",
    confidence: 85,
    rawFmv: 10000,
    gradeCostCents: 3200,
    probabilities: {
      psa10: 0.6,
      psa9: 0.3,
      psa8: 0.05,
      psa_lower: 0.05,
    },
    predictedGradeValues: {
      psa10: 60000,
      psa9: 21000,
      psa8: 6000,
      psa_lower: 3000,
    },
    expectedPostGradeValueCents: 42750,
    expectedRoiCents: 29550,
    sellWindow: "Spring 2024",
    reasoning: "Excellent condition, likely PSA 10 candidate.",
  };

  it("should return limited data for free tier", () => {
    const gated = gateVerdict(fullVerdict, "free");
    expect(gated).toEqual({
      tier: "free",
      decision: "GRADE",
      confidence: 85,
    });

    // Ensure properties that shouldn't be there are indeed absent
    expect(gated).not.toHaveProperty("rawFmv");
    expect(gated).not.toHaveProperty("expectedRoiCents");
    expect(gated).not.toHaveProperty("reasoning");
  });

  it("should return full data for pro tier", () => {
    const gated = gateVerdict(fullVerdict, "pro");
    expect(gated).toEqual({
      ...fullVerdict,
      tier: "pro",
    });
  });

  it("should return full data for elite tier", () => {
    const gated = gateVerdict(fullVerdict, "elite");
    expect(gated).toEqual({
      ...fullVerdict,
      tier: "elite",
    });
  });

  it("should return full data for dealer tier", () => {
    const gated = gateVerdict(fullVerdict, "dealer");
    expect(gated).toEqual({
      ...fullVerdict,
      tier: "dealer",
    });
  });
});
