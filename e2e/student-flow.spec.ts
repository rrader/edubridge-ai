import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }, testInfo) => {
  page.on("pageerror", (error) =>
    console.error("BROWSER PAGE ERROR:", error.stack),
  );
  page.on("console", (message) => {
    if (message.type() === "error")
      console.error("BROWSER CONSOLE ERROR:", message.text());
  });
  page.on("requestfailed", (request) =>
    console.error(
      "BROWSER REQUEST FAILED:",
      request.url(),
      request.failure()?.errorText,
    ),
  );
  page.on("response", (response) => {
    if (response.status() >= 400)
      console.error("BROWSER HTTP ERROR:", response.status(), response.url());
  });
  if (testInfo.title === "first opening asks for a learner name") return;
  await page.goto("/edubridge-ai/");
  const welcome = page.getByRole("dialog");
  await expect(welcome).toBeVisible();
  await page.getByLabel("Your name or nickname").fill("Ava");
  await page.getByRole("button", { name: "Start learning" }).click();
});

test("student opens a fractions lesson and receives deterministic validation", async ({
  page,
}) => {
  await page.getByRole("button", { name: /Продовжити навчання/ }).click();
  await expect(page.getByText("Навчальна ціль")).toBeVisible();
  await page.getByPlaceholder("Твоя відповідь…").fill("2/5");
  await page.getByRole("button", { name: /Перевірити/ }).click();
  await expect(page.getByText(/Відповідь правильна/)).toBeVisible();
});

test("static learning content stays available if remote requests fail", async ({
  page,
}) => {
  await page.route("https://**/*", (route) => route.abort());
  await expect(page.getByText("Математика · 6 клас")).toBeVisible();
  await page.getByRole("button", { name: /Продовжити навчання/ }).click();
  await expect(page.getByText("Навчальна ціль")).toBeVisible();
});

test("prepared PWA shell supports an offline lesson and local progress", async ({
  page,
  context,
}) => {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: "networkidle" });
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Продовжити навчання/ }).click();
  await page.getByPlaceholder("Твоя відповідь…").fill("2/5");
  await page.getByRole("button", { name: /Перевірити/ }).click();
  await expect(page.getByText(/Відповідь правильна/)).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Мій поступ/ }).click();
  await expect(
    page
      .locator(".progress-detail > div")
      .filter({ hasText: "Вправ пройдено" })
      .locator("b"),
  ).toHaveText("1");
});

test("recognizes denominator addition and switches to adaptive learning", async ({
  page,
}) => {
  await page.getByRole("button", { name: /02 · Адаптивна підказка/ }).click();
  await page.getByPlaceholder("Твоя відповідь…").fill("2/6");
  await page.getByRole("button", { name: /Перевірити/ }).click();
  await expect(page.getByText("Адаптивне навчання")).toBeVisible();
  await expect(page.getByText(/Додавання знаменників/)).toBeVisible();
});

test("escalates repeated difficulty and keeps the topic unmastered", async ({
  page,
}) => {
  await page.getByRole("button", { name: /03 · Запит учителю/ }).click();
  for (let i = 0; i < 4; i++) {
    await page.getByPlaceholder("Твоя відповідь…").fill("2/6");
    await page.getByRole("button", { name: /Перевірити/ }).click();
  }
  await expect(page.getByText("Потрібна допомога вчителя")).toBeVisible();
  await expect(
    page.getByText(/Ця тема потребує погляду вчителя/),
  ).toBeVisible();
  await page.getByRole("button", { name: /Для вчителя/ }).click();
  await expect(page.getByText("Запити вчителю")).toBeVisible();
  await expect(page.getByText(/Ava · Додавання дробів/)).toBeVisible();
});

test("first opening asks for a learner name", async ({ page }) => {
  await page.goto("/edubridge-ai/");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Welcome to EduBridge" })).toBeVisible();
});

test("browser AI is the default tutor provider", async ({ page }) => {
  await page.getByRole("button", { name: /AI-тьютор/ }).click();
  const providerSelect = page.locator(".provider-select select");
  await expect(providerSelect).toHaveValue("browser");
  await expect(providerSelect.locator("option[value=demo]")).toHaveCount(0);
});
