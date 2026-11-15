import type { ClockMode } from "@/lib/types";

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isHm(value: string): boolean {
  return TIME_RE.test(value);
}

export function parseHm(value: string): { hours: number; minutes: number } {
  if (!isHm(value)) {
    throw new Error(`Expected a time like 07:30, received ${value}.`);
  }
  const [hours, minutes] = value.split(":").map(Number);
  return { hours, minutes };
}

export function atLocalTime(day: Date, hhmm: string): Date {
  const { hours, minutes } = parseHm(hhmm);
  const next = new Date(day);
  next.setHours(hours, minutes, 0, 0);
  return next;
}

export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatHm(ms: number): string {
  const date = new Date(ms);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function formatDay(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function sameLocalDay(ms: number, day: Date): boolean {
  const other = new Date(ms);
  return (
    other.getFullYear() === day.getFullYear() &&
    other.getMonth() === day.getMonth() &&
    other.getDate() === day.getDate()
  );
}

export function resolveAsOf(
  clockMode: ClockMode,
  demoTime: string,
  now = new Date(),
): Date {
  if (clockMode === "live") return new Date(now);
  const time = isHm(demoTime) ? demoTime : "10:45";
  return atLocalTime(now, time);
}

/** Local-day bounds in UTC milliseconds, using Date.getTimezoneOffset(). */
export function localDayBounds(now: Date, timezoneOffsetMinutes: number): {
  start: number;
  end: number;
} {
  const localMs = now.getTime() - timezoneOffsetMinutes * 60_000;
  const local = new Date(localMs);
  const start =
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) +
    timezoneOffsetMinutes * 60_000;
  return { start, end: start + 86_400_000 };
}
