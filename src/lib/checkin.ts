import type { Baseline, CareEvent, CheckIn, Comparison, WindowCode } from "@/lib/types";
import { formatHm } from "@/lib/time";
import { verifyText } from "@/lib/verifier";

export function draftCheckInMessage(input: {
  caregiverName: string;
  relativeName: string;
  baseline: Baseline;
  comparison: Comparison;
  events: CareEvent[];
}): { message: string; reason: string; eventIds: string[] } | null {
  const morning = input.comparison.windows.find((window) => window.code === "morning_check");
  if (!morning || morning.status !== "missed") return null;
  const name = input.relativeName.trim() || "your relative";
  const later = input.events.find((event) => morning.eventIds.includes(event.id));
  const follow = later
    ? `The first event after that was ${later.deviceName} at ${formatHm(later.startMs)}.`
    : "Nothing else has shown up yet today.";
  const hello = input.caregiverName.trim() ? `Hello ${input.caregiverName.trim()} —` : "Hello —";
  const message = [
    `${hello} this is a small check-in, not an alarm.`,
    `I didn't see ${name}'s usual morning door or motion activity by ${input.baseline.morningCheckBy}. ${follow}`,
    "If you have a moment, a short hello would be welcome.",
    "This message was drafted for you to approve. It has not been sent.",
  ].join(" ");
  const verdict = verifyText(message);
  if (!verdict.ok) {
    throw new Error(`Check-in draft failed the verifier: ${verdict.reasons.join(", ")}`);
  }
  return {
    message,
    reason: `No morning door or motion activity by ${input.baseline.morningCheckBy}.`,
    eventIds: morning.eventIds,
  };
}

export function reconcileCheckIns(input: {
  existing: CheckIn[];
  comparison: Comparison;
  baseline: Baseline;
  events: CareEvent[];
  relativeName: string;
  caregiverName: string;
  now?: string;
}): CheckIn[] {
  const now = input.now ?? new Date().toISOString();
  const morning = input.comparison.deviations.find((window) => window.checkIn);
  let next = input.existing.filter((item) => {
    if (!item.autonomous || item.status !== "draft" || item.dayKey !== input.comparison.dayKey) {
      return true;
    }
    if (!morning) return false;
    return item.code === morning.code;
  });
  if (!morning) return next;
  const id = `${input.comparison.dayKey}:${morning.code}`;
  if (next.some((item) => item.id === id)) return next;
  const drafted = draftCheckInMessage({
    caregiverName: input.caregiverName,
    relativeName: input.relativeName,
    baseline: input.baseline,
    comparison: input.comparison,
    events: input.events,
  });
  if (!drafted) return next;
  const created: CheckIn = {
    id,
    dayKey: input.comparison.dayKey,
    code: morning.code,
    reason: drafted.reason,
    message: drafted.message,
    eventIds: drafted.eventIds,
    status: "draft",
    createdAt: now,
    updatedAt: now,
    autonomous: true,
    sent: false,
  };
  next = [created, ...next];
  return next;
}

export function withCheckInStatus(
  items: CheckIn[],
  id: string,
  status: CheckIn["status"],
  message?: string,
  now = new Date().toISOString(),
): CheckIn[] {
  return items.map((item) => {
    if (item.id !== id) return item;
    const nextMessage = message ?? item.message;
    const verdict = verifyText(nextMessage);
    if (!verdict.ok) {
      throw new Error(`That wording can't be saved: ${verdict.reasons.join(", ")}`);
    }
    return { ...item, status, message: nextMessage, updatedAt: now, sent: false };
  });
}

export function manualCheckIn(input: {
  message: string;
  reason: string;
  eventIds: string[];
  dayKey: string;
  id: string;
  now?: string;
}): CheckIn {
  const verdict = verifyText(input.message);
  if (!verdict.ok) {
    throw new Error(`That check-in can't be drafted: ${verdict.reasons.join(", ")}`);
  }
  const now = input.now ?? new Date().toISOString();
  return {
    id: input.id,
    dayKey: input.dayKey,
    code: "manual" satisfies WindowCode | "manual",
    reason: input.reason || "Drafted from the companion.",
    message: input.message,
    eventIds: input.eventIds,
    status: "draft",
    createdAt: now,
    updatedAt: now,
    autonomous: false,
    sent: false,
  };
}
