import Dexie, { type Table } from "dexie";
export type Attempt = {
  id?: number;
  student: string;
  topicId: string;
  answer: string;
  correct: boolean;
  mode: string;
  provider: string;
  at: string;
  misconception?: string | null;
};
export type TeacherRequest = {
  id?: number;
  student: string;
  topicId: string;
  reasons: string[];
  mistakes: string[];
  interventions: string[];
  suggested: string;
  teacherFeedback?: string;
  status: "open" | "resolved";
  createdAt: string;
};
type RecordRow = { key: string; value: unknown };
class EduDB extends Dexie {
  attempts!: Table<Attempt, number>;
  requests!: Table<TeacherRequest, number>;
  records!: Table<RecordRow, string>;
  constructor() {
    super("edubridge-local");
    this.version(1).stores({
      attempts: "++id, student, topicId, at",
      requests: "++id, status, topicId, createdAt",
      records: "key",
    });
  }
}
export const db = new EduDB();
export async function saveState(key: string, value: unknown) {
  await db.records.put({ key, value });
}
export async function readState<T>(key: string, fallback: T): Promise<T> {
  return ((await db.records.get(key))?.value as T) ?? fallback;
}
export async function exportData() {
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    attempts: await db.attempts.toArray(),
    requests: await db.requests.toArray(),
    records: await db.records.toArray(),
  };
}
export async function importData(data: any) {
  if (data?.schemaVersion !== 1)
    throw new Error("Несумісна версія резервної копії");
  await db.transaction("rw", db.attempts, db.requests, db.records, async () => {
    await db.attempts.clear();
    await db.requests.clear();
    await db.records.clear();
    await db.attempts.bulkAdd(data.attempts ?? []);
    await db.requests.bulkAdd(data.requests ?? []);
    await db.records.bulkPut(data.records ?? []);
  });
}
