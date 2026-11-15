import type {
  Baseline,
  CareEvent,
  Comparison,
  DeviceRole,
  WindowResult,
  WindowStatus,
} from "@/lib/types";
import { dayKey, formatHm, isHm, parseHm } from "@/lib/time";

const MIN = 1;

export function inferRole(name: string): DeviceRole {
  if (/door|doorbell|entry|porch|gate/i.test(name)) return "door";
  if (/kitchen|dinette|dining|pantry/i.test(name)) return "kitchen";
  return "other";
}

export function baselineErrors(baseline: Baseline): string[] {
  const errors: string[] = [];
  const fields: [keyof Baseline, string][] = [
    ["wakeStart", "Wake start"],
    ["wakeEnd", "Wake end"],
    ["morningCheckBy", "Morning check"],
    ["doorStart", "Door start"],
    ["doorEnd", "Door end"],
    ["lunchStart", "Lunch start"],
    ["lunchEnd", "Lunch end"],
    ["dinnerStart", "Dinner start"],
    ["dinnerEnd", "Dinner end"],
    ["eveningStart", "Evening start"],
    ["eveningSettleBy", "Settle time"],
  ];
  for (const [key, label] of fields) {
    if (!isHm(baseline[key])) errors.push(`${label} needs a time like 07:30.`);
  }
  if (errors.length) return errors;
  const order: [keyof Baseline, keyof Baseline, string][] = [
    ["wakeStart", "wakeEnd", "Wake end"],
    ["doorStart", "doorEnd", "Door end"],
    ["lunchStart", "lunchEnd", "Lunch end"],
    ["dinnerStart", "dinnerEnd", "Dinner end"],
    ["eveningStart", "eveningSettleBy", "Settle time"],
  ];
  for (const [start, end, label] of order) {
    if (minutes(baseline[end]) <= minutes(baseline[start])) {
      errors.push(`${label} has to be later than its start.`);
    }
  }
  return errors;
}

function minutes(value: string): number {
  const { hours, minutes: mins } = parseHm(value);
  return hours * 60 + mins;
}

function stamp(day: Date, hhmm: string): number {
  const { hours, minutes: mins } = parseHm(hhmm);
  const next = new Date(day);
  next.setHours(hours, mins, 0, 0);
  return next.getTime();
}

function cited(events: CareEvent[], ids: string[]): string {
  return events
    .filter((event) => ids.includes(event.id))
    .map((event) => `${event.deviceName} at ${formatHm(event.startMs)}`)
    .join(", ");
}

function windowStatus(
  now: number,
  start: number,
  end: number,
  count: number,
): WindowStatus {
  if (now < start) return "upcoming";
  if (count >= MIN) return "met";
  if (now < end) return "in_progress";
  return "missed";
}

export function compareBaseline(input: {
  baseline: Baseline;
  events: CareEvent[];
  asOf: Date;
}): Comparison {
  const { baseline, asOf } = input;
  const now = asOf.getTime();
  const events = input.events
    .filter((event) => event.startMs <= now)
    .filter((event) => {
      const when = new Date(event.startMs);
      return (
        when.getFullYear() === asOf.getFullYear() &&
        when.getMonth() === asOf.getMonth() &&
        when.getDate() === asOf.getDate()
      );
    })
    .sort((a, b) => a.startMs - b.startMs);

  const between = (start: string, end: string, pred: (event: CareEvent) => boolean) =>
    events.filter(
      (event) =>
        pred(event) &&
        event.startMs >= stamp(asOf, start) &&
        event.startMs <= stamp(asOf, end),
    );

  const anyMotion = (event: CareEvent) =>
    event.eventType === "motion" || event.eventType === "ding";

  const wakeHits = between(baseline.wakeStart, baseline.wakeEnd, anyMotion);
  const doorHits = between(
    baseline.doorStart,
    baseline.doorEnd,
    (event) => event.role === "door",
  );
  const lunchHits = between(
    baseline.lunchStart,
    baseline.lunchEnd,
    (event) => event.role === "kitchen",
  );
  const dinnerHits = between(
    baseline.dinnerStart,
    baseline.dinnerEnd,
    (event) => event.role === "kitchen",
  );
  const eveningHits = between(baseline.eveningStart, baseline.eveningSettleBy, anyMotion);
  const morningDeadline = stamp(asOf, baseline.morningCheckBy);
  const morningHits = events.filter(
    (event) => anyMotion(event) && event.startMs <= morningDeadline,
  );
  const afterSettle = events.filter(
    (event) => anyMotion(event) && event.startMs > stamp(asOf, baseline.eveningSettleBy),
  );

  const wake = describeRange({
    code: "wake",
    label: "Wake",
    status: windowStatus(
      now,
      stamp(asOf, baseline.wakeStart),
      stamp(asOf, baseline.wakeEnd),
      wakeHits.length,
    ),
    hits: wakeHits,
    events,
    met: `Wake-time movement matched ${baseline.wakeStart}–${baseline.wakeEnd}`,
    open: `The wake window is open until ${baseline.wakeEnd}, with no movement in it yet`,
    missed: `No door or motion events fell inside the wake window ${baseline.wakeStart}–${baseline.wakeEnd}`,
    upcoming: `The wake window opens at ${baseline.wakeStart}`,
  });

  const later = events.find((event) => event.startMs > morningDeadline);
  const morningStatus: WindowStatus = morningHits.length
    ? "met"
    : now < morningDeadline
      ? "in_progress"
      : "missed";
  const morningIds =
    morningStatus === "missed" && later ? [later.id] : morningHits.map((event) => event.id);
  const morning: WindowResult = {
    code: "morning_check",
    label: "Morning check",
    status: morningStatus,
    eventIds: morningIds,
    checkIn: morningStatus === "missed",
    detail:
      morningStatus === "met"
        ? `Morning movement was on record before ${baseline.morningCheckBy} (${cited(events, morningHits.map((event) => event.id))}).`
        : morningStatus === "in_progress"
          ? `The morning check is still open until ${baseline.morningCheckBy}. Nothing has shown up yet.`
          : later
            ? `No door or motion events arrived before ${baseline.morningCheckBy}. The earliest event after that is ${later.deviceName} at ${formatHm(later.startMs)}.`
            : `No door or motion events arrived before ${baseline.morningCheckBy}.`,
  };

  const door = describeRange({
    code: "door",
    label: "Door",
    status: windowStatus(
      now,
      stamp(asOf, baseline.doorStart),
      stamp(asOf, baseline.doorEnd),
      doorHits.length,
    ),
    hits: doorHits,
    events,
    met: `Front-door activity matched ${baseline.doorStart}–${baseline.doorEnd}`,
    open: `The front-door window is still open until ${baseline.doorEnd}, with no doorbell or door motion yet`,
    missed: `No doorbell or door motion landed in ${baseline.doorStart}–${baseline.doorEnd}`,
    upcoming: `The front-door window opens at ${baseline.doorStart}`,
  });

  const lunch = describeRange({
    code: "lunch",
    label: "Lunch",
    status: windowStatus(
      now,
      stamp(asOf, baseline.lunchStart),
      stamp(asOf, baseline.lunchEnd),
      lunchHits.length,
    ),
    hits: lunchHits,
    events,
    met: `Kitchen movement matched the lunch window ${baseline.lunchStart}–${baseline.lunchEnd}`,
    open: `The lunch window is open until ${baseline.lunchEnd}, with no kitchen motion yet`,
    missed: `No kitchen motion landed in the lunch window ${baseline.lunchStart}–${baseline.lunchEnd}`,
    upcoming: `The lunch window opens at ${baseline.lunchStart}`,
  });

  const dinner = describeRange({
    code: "dinner",
    label: "Dinner",
    status: windowStatus(
      now,
      stamp(asOf, baseline.dinnerStart),
      stamp(asOf, baseline.dinnerEnd),
      dinnerHits.length,
    ),
    hits: dinnerHits,
    events,
    met: `Kitchen movement matched the dinner window ${baseline.dinnerStart}–${baseline.dinnerEnd}`,
    open: `The dinner window is open until ${baseline.dinnerEnd}, with no kitchen motion yet`,
    missed: `No kitchen motion landed in the dinner window ${baseline.dinnerStart}–${baseline.dinnerEnd}`,
    upcoming: `The dinner window opens at ${baseline.dinnerStart}`,
  });

  const evening = describeRange({
    code: "evening",
    label: "Evening",
    status: windowStatus(
      now,
      stamp(asOf, baseline.eveningStart),
      stamp(asOf, baseline.eveningSettleBy),
      eveningHits.length,
    ),
    hits: eveningHits,
    events,
    met: `Evening movement matched ${baseline.eveningStart}–${baseline.eveningSettleBy}`,
    open: `The evening window is open until ${baseline.eveningSettleBy}, with no movement in it yet`,
    missed: `No door or motion events landed in the evening window ${baseline.eveningStart}–${baseline.eveningSettleBy}`,
    upcoming: `The evening window opens at ${baseline.eveningStart}`,
  });

  const settleStart = stamp(asOf, baseline.eveningSettleBy);
  const settleStatus: WindowStatus =
    now <= settleStart ? "upcoming" : afterSettle.length ? "missed" : "met";
  const settle: WindowResult = {
    code: "settle",
    label: "Settle",
    status: settleStatus,
    eventIds: afterSettle.map((event) => event.id),
    checkIn: false,
    detail:
      settleStatus === "upcoming"
        ? `The settle time is ${baseline.eveningSettleBy}.`
        : settleStatus === "met"
          ? `No door or motion events after the ${baseline.eveningSettleBy} settle time.`
          : `There is movement after the ${baseline.eveningSettleBy} settle time (${cited(events, afterSettle.map((event) => event.id))}).`,
  };

  const windows = [wake, morning, door, lunch, dinner, evening, settle];
  return {
    asOf: asOf.toISOString(),
    dayKey: dayKey(asOf),
    windows,
    deviations: windows.filter((window) => window.status === "missed"),
  };
}

function describeRange(input: {
  code: WindowResult["code"];
  label: string;
  status: WindowStatus;
  hits: CareEvent[];
  events: CareEvent[];
  met: string;
  open: string;
  missed: string;
  upcoming: string;
}): WindowResult {
  const ids = input.hits.map((event) => event.id);
  const names = cited(input.events, ids);
  const detail =
    input.status === "met"
      ? `${input.met}${names ? ` (${names})` : ""}.`
      : input.status === "in_progress"
        ? `${input.open}.`
        : input.status === "missed"
          ? `${input.missed}.`
          : `${input.upcoming}.`;
  return {
    code: input.code,
    label: input.label,
    status: input.status,
    eventIds: input.status === "met" ? ids : [],
    detail,
    checkIn: false,
  };
}
