import { describe, expect, it } from "vitest";
import { generateSlug, isValidSlug, normalizeSlug } from "@/lib/subspace-slugs";

describe("subspace slug helpers", () => {
  it("normalizes human text into lowercase URL slugs", () => {
    expect(generateSlug("  Café AI: Launch Notes!  ")).toBe(
      "cafe-ai-launch-notes",
    );
    expect(normalizeSlug("Research & Development")).toBe(
      "research-development",
    );
  });

  it("trims separators and caps generated slugs to the maximum length", () => {
    const slug = generateSlug(`${"a".repeat(90)}!!!`);

    expect(slug).toHaveLength(80);
    expect(slug).toMatch(/^[a]+$/);
  });

  it("validates accepted and rejected slug shapes", () => {
    expect(isValidSlug("ai-news")).toBe(true);
    expect(isValidSlug("a1-b2")).toBe(true);
    expect(isValidSlug("AI-News")).toBe(false);
    expect(isValidSlug("-ai-news")).toBe(false);
    expect(isValidSlug("ai--news")).toBe(false);
    expect(isValidSlug("")).toBe(false);
    expect(isValidSlug("a".repeat(81))).toBe(false);
  });
});
