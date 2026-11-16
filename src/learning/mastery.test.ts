import { describe, expect, it } from "vitest";
import { isTopicMastered, nextUnmastered } from "./mastery";
describe("topic mastery", () => {
  it("requires two correct attempts", () => {
    expect(isTopicMastered(1)).toBe(false);
    expect(isTopicMastered(2)).toBe(true);
  });
  it("chooses the first unmastered topic", () => {
    expect(nextUnmastered([{ id: "a" }, { id: "b" }], { a: 2 })?.id).toBe("b");
  });
});
