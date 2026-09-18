import { describe, it, expect } from "vitest";
import { cn } from "./utils";

describe("cn utility function", () => {
  it("should merge standard tailwind classes", () => {
    expect(cn("p-2", "m-2")).toBe("p-2 m-2");
  });

  it("should merge and resolve conflicting tailwind classes", () => {
    // twMerge logic: later classes overwrite earlier ones of the same type
    expect(cn("px-2 py-1", "p-4")).toBe("p-4");
  });

  it("should handle conditional classes using clsx logic", () => {
    expect(cn("p-2", { "m-2": true, "m-4": false })).toBe("p-2 m-2");
  });

  it("should handle arrays of classes", () => {
    expect(cn(["p-2", "m-2"], "flex")).toBe("p-2 m-2 flex");
  });

  it("should ignore undefined, null, and false values", () => {
    expect(cn("p-2", undefined, null, false, "m-2")).toBe("p-2 m-2");
  });

  it("should correctly handle complex real-world examples", () => {
    const isActive = true;
    const isError = false;

    expect(
      cn(
        "base-class text-sm",
        isActive && "bg-blue-500 text-white",
        isError && "bg-red-500",
        "p-4",
        "p-2" // conflicting padding
      )
    ).toBe("base-class text-sm bg-blue-500 text-white p-2");
  });
});
