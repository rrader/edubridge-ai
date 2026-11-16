import { describe, expect, it, vi } from "vitest";
import {
  AIProviderRouter,
  BrowserAIProvider,
  CloudAIProvider,
  DeterministicDemoProvider,
} from "./ai";
describe("AI provider routing", () => {
  it("uses the lesson explanation for course-only chat without claiming it is AI", async () => {
    const provider = new DeterministicDemoProvider();
    const answer = await provider.reply([
      { role: "system", content: "Пояснення: Дріб показує рівні частини. Приклади: 1/2" },
      { role: "user", content: "Поясни" },
    ]);
    expect(answer).toContain("Дріб показує рівні частини");
    expect(answer).toContain("не відповідь, згенерована AI");
  });
  it("uses deterministic course content if no cloud configured", async () => {
    const router = new AIProviderRouter(
      new CloudAIProvider({ url: "", model: "", apiKey: "" }),
      new BrowserAIProvider(),
      new DeterministicDemoProvider(),
    );
    const x = await router.ask(
      [{ role: "user", content: "hi" }],
      "auto",
      () => {},
    );
    expect(x.provider).toBe("demo");
  });
  it("falls back after a real cloud failure without claiming cloud succeeded", async () => {
    const cloud = new CloudAIProvider({
      url: "https://invalid.example/v1/chat/completions",
      model: "x",
      apiKey: "",
    });
    vi.spyOn(cloud, "reply").mockRejectedValue(new Error("network"));
    const router = new AIProviderRouter(
      cloud,
      new BrowserAIProvider(),
      new DeterministicDemoProvider(),
    );
    const fallback = vi.fn();
    const x = await router.ask(
      [{ role: "user", content: "hi" }],
      "auto",
      fallback,
    );
    expect(x.provider).toBe("demo");
    expect(fallback).toHaveBeenCalledOnce();
  });
});
