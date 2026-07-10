export type PeriodKey = "30d" | "quarter" | "year" | "all";

export const PERIODS: { value: PeriodKey; label: string }[] = [
  { value: "30d", label: "Laatste 30 dagen" },
  { value: "quarter", label: "Dit kwartaal" },
  { value: "year", label: "Dit jaar" },
  { value: "all", label: "Alles" },
];

export function periodRange(p: PeriodKey): {
  from: Date | null;
  to: Date;
  label: string;
  months: number;
} {
  const now = new Date();
  if (p === "30d") {
    return {
      from: new Date(now.getTime() - 30 * 864e5),
      to: now,
      label: "laatste 30 dagen",
      months: 1,
    };
  }
  if (p === "quarter") {
    const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    return { from: qStart, to: now, label: "dit kwartaal", months: 3 };
  }
  if (p === "year") {
    return {
      from: new Date(now.getFullYear(), 0, 1),
      to: now,
      label: "dit jaar",
      months: 12,
    };
  }
  return { from: null, to: now, label: "alle tijd", months: 12 };
}

export function isValidPeriod(v: unknown): v is PeriodKey {
  return v === "30d" || v === "quarter" || v === "year" || v === "all";
}
