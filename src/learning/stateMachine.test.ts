import { describe, expect, it } from "vitest";
import { decideMode } from "./stateMachine";
describe("explainable learning mode transitions", () => {
  it("starts independently and offers adaptation after two errors", () => {
    expect(
      decideMode("independent", { topicId: "add", correct: false, attempts: 1 })
        .mode,
    ).toBe("independent");
    expect(
      decideMode("independent", { topicId: "add", correct: false, attempts: 2 })
        .mode,
    ).toBe("adaptive");
  });
  it("escalates only after configured interventions", () => {
    expect(
      decideMode("adaptive", {
        topicId: "add",
        correct: false,
        attempts: 4,
        interventions: 3,
      }),
    ).toMatchObject({ mode: "teacher", action: "create_teacher_request" });
  });
  it("returns to independent learning after success and preserves teacher mode", () => {
    expect(
      decideMode("adaptive", { topicId: "add", correct: true, attempts: 3 })
        .mode,
    ).toBe("independent");
    expect(
      decideMode("teacher", { topicId: "add", correct: true, attempts: 9 })
        .mode,
    ).toBe("teacher");
  });
});
