export const MASTERY_REQUIRED = 2;
export function isTopicMastered(correctAttempts: number): boolean {
  return correctAttempts >= MASTERY_REQUIRED;
}
export function nextUnmastered<T extends { id: string }>(
  topics: T[],
  mastery: Record<string, number>,
): T | undefined {
  return topics.find((topic) => !isTopicMastered(mastery[topic.id] ?? 0));
}
