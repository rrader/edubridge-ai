import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db, exportData, importData, readState, saveState } from "./storage";
describe("local persistence and portable backup", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });
  it("persists settings in IndexedDB", async () => {
    await saveState("student", "Оля");
    expect(await readState("student", "")).toBe("Оля");
  });
  it("roundtrips exported schema", async () => {
    await saveState("student", "Тарас");
    const copy = await exportData();
    await saveState("student", "інший");
    await importData(copy);
    expect(await readState("student", "")).toBe("Тарас");
  });
});
