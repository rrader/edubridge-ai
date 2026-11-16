export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};
export interface AIProvider {
  id: string;
  label: string;
  available(): Promise<boolean>;
  reply(messages: ChatMessage[]): Promise<string>;
}
export class DeterministicDemoProvider implements AIProvider {
  id = "demo";
  label = "Пояснення курсу";
  async available() {
    return true;
  }
  async reply(messages: ChatMessage[]) {
    const system = messages.find((message) => message.role === "system")?.content ?? "";
    const explanation = system.match(/Пояснення: ([\s\S]*?)\. Приклади:/)?.[1];
    if (explanation)
      return `Матеріал курсу: ${explanation}. Це підготовлене пояснення, а не відповідь, згенерована AI.`;
    return "Це підготовлені матеріали курсу, а не відповідь, згенерована AI. Відкрий урок, щоб переглянути пояснення та приклади.";
  }
}
export class CloudAIProvider implements AIProvider {
  id = "cloud";
  label = "Хмарний AI";
  private config: { url: string; model: string; apiKey: string };
  constructor(config: { url: string; model: string; apiKey: string }) {
    this.config = config;
  }
  async available() {
    return !!this.config.url && !!this.config.model;
  }
  async reply(messages: ChatMessage[]) {
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 18000);
    try {
      const r = await fetch(this.config.url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(this.config.apiKey
            ? { Authorization: `Bearer ${this.config.apiKey}` }
            : {}),
        },
        body: JSON.stringify({
          model: this.config.model,
          messages,
          temperature: 0.4,
        }),
      });
      if (!r.ok) throw new Error(`Cloud ${r.status}`);
      const data = await r.json();
      const text = data.choices?.[0]?.message?.content;
      if (typeof text !== "string") throw new Error("Invalid response");
      return text;
    } finally {
      clearTimeout(timer);
    }
  }
}
export class BrowserAIProvider implements AIProvider {
  id = "browser";
  label = "AI у браузері";
  private engine: any;
  private loading?: Promise<any>;
  readonly modelId = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";
  async available() {
    return !!(navigator as any).gpu;
  }
  get isReady() {
    return !!this.engine;
  }
  async prepare(progress: (p: number) => void) {
    if (!(await this.available()))
      throw new Error("Цей браузер або пристрій не підтримує WebGPU.");
    if (!this.loading)
      this.loading = import("@mlc-ai/web-llm").then(async (m) => {
        const engine = await m.CreateMLCEngine(this.modelId, {
          initProgressCallback: (x: any) => progress(x.progress ?? 0),
        });
        this.engine = engine;
        return engine;
      });
    return this.loading;
  }
  async reply(messages: ChatMessage[]) {
    if (!this.engine) throw new Error("Спершу підготуйте офлайн-модель.");
    const result = await this.engine.chat.completions.create({
      messages,
      temperature: 0.3,
      max_tokens: 220,
    });
    return (
      result.choices[0]?.message?.content ?? "Не вдалося сформувати відповідь."
    );
  }
}
export class AIProviderRouter {
  public cloud: CloudAIProvider;
  public browser: BrowserAIProvider;
  public demo: DeterministicDemoProvider;
  constructor(
    cloud: CloudAIProvider,
    browser: BrowserAIProvider,
    demo: DeterministicDemoProvider,
  ) {
    this.cloud = cloud;
    this.browser = browser;
    this.demo = demo;
  }
  async ask(
    messages: ChatMessage[],
    manual: "auto" | "cloud" | "browser" | "demo",
    onFallback: () => void,
  ) {
    if (manual === "demo")
      return { text: await this.demo.reply(messages), provider: this.demo.id };
    if (manual === "browser")
      return {
        text: await this.browser.reply(messages),
        provider: this.browser.id,
      };
    if (manual === "cloud") {
      return {
        text: await this.cloud.reply(messages),
        provider: this.cloud.id,
      };
    }
    if (await this.cloud.available())
      try {
        return {
          text: await this.cloud.reply(messages),
          provider: this.cloud.id,
        };
      } catch {
        onFallback();
      }
    if (this.browser.isReady)
      return {
        text: await this.browser.reply(messages),
        provider: this.browser.id,
      };
    return { text: await this.demo.reply(messages), provider: this.demo.id };
  }
}
