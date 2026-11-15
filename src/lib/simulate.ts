import { SCENARIO_LABEL } from "@/lib/defaults";
import type { CareEvent, Scenario } from "@/lib/types";
import { atLocalTime } from "@/lib/time";

type Script = {
  time: string;
  deviceId: string;
  deviceName: string;
  role: CareEvent["role"];
  eventType: CareEvent["eventType"];
  subtype?: string;
};

const QUIET: Script[] = [
  { time: "10:40", deviceId: "sim-hall", deviceName: "Hallway", role: "other", eventType: "motion", subtype: "human" },
  { time: "12:15", deviceId: "sim-kitchen", deviceName: "Kitchen", role: "kitchen", eventType: "motion", subtype: "human" },
  { time: "15:10", deviceId: "sim-door", deviceName: "Front Door", role: "door", eventType: "ding" },
  { time: "18:05", deviceId: "sim-kitchen", deviceName: "Kitchen", role: "kitchen", eventType: "motion", subtype: "human" },
  { time: "20:10", deviceId: "sim-hall", deviceName: "Hallway", role: "other", eventType: "motion", subtype: "human" },
];

const STEADY: Script[] = [
  { time: "07:20", deviceId: "sim-kitchen", deviceName: "Kitchen", role: "kitchen", eventType: "motion", subtype: "human" },
  { time: "07:55", deviceId: "sim-door", deviceName: "Front Door", role: "door", eventType: "ding" },
  { time: "08:40", deviceId: "sim-door", deviceName: "Front Door", role: "door", eventType: "motion", subtype: "human" },
  { time: "12:05", deviceId: "sim-kitchen", deviceName: "Kitchen", role: "kitchen", eventType: "motion", subtype: "human" },
  { time: "18:20", deviceId: "sim-kitchen", deviceName: "Kitchen", role: "kitchen", eventType: "motion", subtype: "human" },
  { time: "20:40", deviceId: "sim-hall", deviceName: "Hallway", role: "other", eventType: "motion", subtype: "human" },
];

const RESTLESS: Script[] = [
  ...STEADY,
  { time: "22:20", deviceId: "sim-hall", deviceName: "Hallway", role: "other", eventType: "motion", subtype: "human" },
  { time: "22:45", deviceId: "sim-door", deviceName: "Front Door", role: "door", eventType: "motion", subtype: "human" },
];

const SCRIPTS: Record<Scenario, Script[]> = {
  "quiet-morning": QUIET,
  steady: STEADY,
  "restless-evening": RESTLESS,
};

export function scenarioLabel(scenario: Scenario): string {
  return SCENARIO_LABEL[scenario];
}

export function buildSimulatedEvents(scenario: Scenario, day: Date): CareEvent[] {
  return SCRIPTS[scenario].map((row, index) => {
    const start = atLocalTime(day, row.time).getTime();
    return {
      id: `sim-${scenario}-${index + 1}`,
      source: "simulated",
      deviceId: row.deviceId,
      deviceName: row.deviceName,
      role: row.role,
      eventType: row.eventType,
      subtype: row.subtype,
      startMs: start,
      endMs: start + 30_000,
    };
  });
}
