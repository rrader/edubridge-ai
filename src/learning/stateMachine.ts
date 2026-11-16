export type Mode = "independent" | "adaptive" | "teacher";
export type Event = {
  correct: boolean;
  misconception?: string | null;
  topicId: string;
  attempts: number;
  interventions?: number;
};
export type Decision = { mode: Mode; reason: string; action: string };
export const thresholds = {
  adaptiveAfter: 2,
  teacherAfter: 3,
  masteryCorrect: 2,
};
export function decideMode(current: Mode, event: Event): Decision {
  if (current === "teacher")
    return {
      mode: "teacher",
      reason: "Тему передано вчителю; потрібен перегляд запиту.",
      action: "continue_other_topics",
    };
  if (event.correct)
    return {
      mode: "independent",
      reason: "Правильна відповідь підтвердила розуміння поточного кроку.",
      action: "continue",
    };
  const interventions = event.interventions ?? 0;
  if (interventions >= thresholds.teacherAfter)
    return {
      mode: "teacher",
      reason: "Труднощі залишилися після трьох адаптивних підказок.",
      action: "create_teacher_request",
    };
  if (event.attempts >= thresholds.adaptiveAfter || event.misconception)
    return {
      mode: "adaptive",
      reason: event.misconception
        ? `Виявлено типову помилку: ${event.misconception}`
        : "Дві невдалі спроби поспіль.",
      action: "show_alternative_explanation",
    };
  return {
    mode: "independent",
    reason: "Продовжуємо звичайний маршрут і збираємо ще одну спробу.",
    action: "retry",
  };
}
