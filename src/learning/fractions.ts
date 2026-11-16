export type Fraction = { n: number; d: number };
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));
export function normalize(f: Fraction): Fraction {
  if (!Number.isInteger(f.n) || !Number.isInteger(f.d) || f.d === 0)
    throw new Error("Некоректний дріб");
  const sign = f.d < 0 ? -1 : 1,
    g = gcd(f.n, f.d);
  return { n: (sign * f.n) / g, d: Math.abs(f.d) / g };
}
export function parseFraction(input: string): Fraction | null {
  const value = input.trim().replace(",", ".");
  if (/^-?\d+\s*\/\s*-?\d+$/.test(value)) {
    const [n, d] = value.split("/").map(Number);
    if (!d) return null;
    return normalize({ n, d });
  }
  if (/^-?\d+$/.test(value)) return { n: Number(value), d: 1 };
  return null;
}
export function equalFractions(a: Fraction, b: Fraction): boolean {
  const x = normalize(a),
    y = normalize(b);
  return x.n === y.n && x.d === y.d;
}
export function compareFractions(a: Fraction, b: Fraction): -1 | 0 | 1 {
  const left = a.n * b.d,
    right = b.n * a.d;
  return left < right ? -1 : left > right ? 1 : 0;
}
export function detectComparisonMisconception(
  input: string,
  a: Fraction,
  b: Fraction,
): string | null {
  const picked = input.trim();
  const actual = compareFractions(a, b);
  const byDenominator = Math.sign(a.d - b.d);
  if (
    (picked === ">" ? 1 : picked === "<" ? -1 : 0) !== actual &&
    byDenominator !== 0 &&
    byDenominator !== actual &&
    (picked === ">" ? 1 : picked === "<" ? -1 : 0) === byDenominator
  )
    return "Схоже, знаменники порівняно як цілі числа. За однакового чисельника більший знаменник означає дрібніші частини.";
  return null;
}
export function validateFractionAnswer(
  input: string,
  expected: Fraction,
): boolean {
  const parsed = parseFraction(input);
  return !!parsed && equalFractions(parsed, expected);
}
export function generateFractionExercise(
  seed: number,
  operation: "add" | "subtract" = "add",
) {
  const s = Math.abs(Math.trunc(seed));
  let d1 = 2 + (s % 6),
    d2 = 2 + (Math.floor(s / 3) % 5);
  let n1 = 1 + ((s * 3 + 1) % (d1 - 1)),
    n2 = 1 + ((s * 7 + 2) % (d2 - 1));
  if (operation === "subtract" && n1 * d2 < n2 * d1) {
    [n1, n2] = [n2, n1];
    [d1, d2] = [d2, d1];
  }
  const numerator = operation === "add" ? n1 * d2 + n2 * d1 : n1 * d2 - n2 * d1;
  const answer = normalize({ n: numerator, d: d1 * d2 });
  return {
    prompt: `Обчисли: ${n1}/${d1} ${operation === "add" ? "+" : "−"} ${n2}/${d2}`,
    answer: `${answer.n}/${answer.d}`,
    hint: "Знайди спільний знаменник, перетвори дроби на рівні й виконай дію.",
    level: "Тренування",
  };
}
export function detectMisconception(
  input: string,
  a: Fraction,
  b: Fraction,
  operation: "add" | "subtract" | "compare",
) {
  const raw = input.trim().match(/^(-?\d+)\s*\/\s*(-?\d+)$/);
  const parsed = parseFraction(input);
  if (!parsed) return null;
  const rawN = raw ? Number(raw[1]) : parsed.n,
    rawD = raw ? Number(raw[2]) : parsed.d;
  if (operation === "add" && rawN === a.n + b.n && rawD === a.d + b.d)
    return "Додавання знаменників: знаменники показують розмір частин і не додаються.";
  if (
    operation === "compare" &&
    Math.sign(parsed.n - parsed.d) === Math.sign(a.d - b.d)
  )
    return "Порівняння знаменників як цілих чисел не визначає, який дріб більший.";
  if (
    operation === "add" &&
    a.d !== b.d &&
    parsed.n === a.n + b.n &&
    parsed.d === a.d
  )
    return "Схоже, додано чисельники без зведення до спільного знаменника.";
  if (parsed.d === 1 && input.includes("/"))
    return "Перевір, чи чисельник і знаменник не переплутані.";
  return null;
}
