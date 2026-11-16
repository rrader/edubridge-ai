import { describe, expect, it } from "vitest";
import {
  compareFractions,
  detectComparisonMisconception,
  detectMisconception,
  equalFractions,
  generateFractionExercise,
  normalize,
  parseFraction,
  validateFractionAnswer,
} from "./fractions";

describe("fraction arithmetic", () => {
  it("normalizes signs and reduces exact rational values", () => {
    expect(normalize({ n: 6, d: -8 })).toEqual({ n: -3, d: 4 });
  });
  it("accepts equivalent forms and rejects invalid denominators", () => {
    expect(validateFractionAnswer("2/4", { n: 1, d: 2 })).toBe(true);
    expect(parseFraction("4/0")).toBeNull();
  });
  it("compares rational values by normalized integers", () => {
    expect(equalFractions({ n: 5, d: 10 }, { n: 1, d: 2 })).toBe(true);
  });
  it("detects the common denominator-addition mistake", () => {
    expect(
      detectMisconception("2/6", { n: 1, d: 3 }, { n: 1, d: 3 }, "add"),
    ).toContain("знаменників");
  });
  it("compares fractions exactly and detects denominator-as-size errors", () => {
    expect(compareFractions({ n: 3, d: 4 }, { n: 3, d: 7 })).toBe(1);
    expect(
      detectComparisonMisconception("<", { n: 3, d: 4 }, { n: 3, d: 7 }),
    ).toContain("цілі числа");
  });
  it("generates repeatable addition and nonnegative subtraction tasks with exact keys", () => {
    for (const seed of [0, 1, 7, 19])
      for (const op of ["add", "subtract"] as const) {
        const task = generateFractionExercise(seed, op);
        const [a, b, c, d] = task.prompt.match(/\d+/g)!.map(Number);
        const expected = normalize({
          n: op === "add" ? a * d + c * b : a * d - c * b,
          d: b * d,
        });
        expect(task.answer).toBe(`${expected.n}/${expected.d}`);
        expect(task).toEqual(generateFractionExercise(seed, op));
      }
  });
});
