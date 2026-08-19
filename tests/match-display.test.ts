import { describe, expect, it } from "vitest";
import {
  confidenceBand,
  labeledItemFromUnknown,
  parseLabeledItem,
} from "@/lib/match-display";

describe("parseLabeledItem", () => {
  it("splits em-dash title and explanation", () => {
    expect(
      parseLabeledItem(
        "Product Manager vs Agile/Delivery Coach — Recent titles emphasize coaching"
      )
    ).toEqual({
      label: "Product Manager vs Agile/Delivery Coach",
      detail: "Recent titles emphasize coaching",
    });
  });

  it("splits Label: detail experience notes", () => {
    expect(
      parseLabeledItem("Total professional: 15+ years (supported in span)")
    ).toEqual({
      label: "Total professional",
      detail: "15+ years (supported in span)",
    });
  });
});

describe("labeledItemFromUnknown", () => {
  it("joins title and explanation objects from the model", () => {
    expect(
      labeledItemFromUnknown({
        title: "Role-title fit",
        explanation: "Stronger as a transformation leader than Senior PM",
      })
    ).toBe("Role-title fit — Stronger as a transformation leader than Senior PM");
  });
});

describe("confidenceBand", () => {
  it("maps numeric confidence to High/Medium/Low", () => {
    expect(confidenceBand(85)).toBe("High");
    expect(confidenceBand(54)).toBe("Medium");
    expect(confidenceBand(40)).toBe("Low");
  });
});
