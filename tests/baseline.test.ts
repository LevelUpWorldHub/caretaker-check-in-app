import { describe, expect, it } from "vitest";
import { compareBaseline } from "@/lib/baseline";
import { defaultBaseline } from "@/lib/defaults";
import { buildSimulatedEvents } from "@/lib/simulate";
import type { CareEvent } from "@/lib/types";

const day = new Date(2026, 10, 13, 10, 45, 0);

function at(hours: number, minutes: number) {
  return new Date(2026, 10, 13, hours, minutes, 0);
}

describe("baseline comparison", () => {
  it("drafts a morning check when the quiet morning has no activity by 09:30", () => {
    const events = buildSimulatedEvents("quiet-morning", day);
    const comparison = compareBaseline({ baseline: defaultBaseline, events, asOf: day });
    const morning = comparison.windows.find((window) => window.code === "morning_check");
    const wake = comparison.windows.find((window) => window.code === "wake");
    const door = comparison.windows.find((window) => window.code === "door");
    const lunch = comparison.windows.find((window) => window.code === "lunch");
    expect(morning?.status).toBe("missed");
    expect(morning?.checkIn).toBe(true);
    expect(morning?.eventIds).toEqual(["sim-quiet-morning-1"]);
    expect(morning?.detail).toContain("Hallway");
    expect(morning?.detail).toContain("10:40");
    expect(wake?.status).toBe("missed");
    expect(wake?.checkIn).toBe(false);
    expect(door?.status).toBe("in_progress");
    expect(lunch?.status).toBe("upcoming");
    expect(comparison.deviations.map((window) => window.code)).toEqual(["wake", "morning_check"]);
  });

  it("matches a steady morning and does not ask for a check-in", () => {
    const events = buildSimulatedEvents("steady", day);
    const comparison = compareBaseline({ baseline: defaultBaseline, events, asOf: day });
    expect(comparison.windows.find((window) => window.code === "morning_check")?.status).toBe("met");
    expect(comparison.windows.find((window) => window.code === "wake")?.status).toBe("met");
    expect(comparison.windows.find((window) => window.code === "door")?.status).toBe("met");
    expect(comparison.deviations.some((window) => window.checkIn)).toBe(false);
  });

  it("treats the check time itself as missed when nothing has happened", () => {
    const comparison = compareBaseline({
      baseline: defaultBaseline,
      events: [],
      asOf: at(9, 30),
    });
    expect(comparison.windows.find((window) => window.code === "morning_check")?.status).toBe("missed");
  });

  it("ignores events after the clock and events from another day", () => {
    const events = buildSimulatedEvents("steady", day);
    const yesterday: CareEvent = {
      ...events[0]!,
      id: "yesterday",
      startMs: new Date(2026, 10, 12, 7, 20).getTime(),
      endMs: new Date(2026, 10, 12, 7, 20).getTime(),
    };
    const comparison = compareBaseline({
      baseline: defaultBaseline,
      events: [...events, yesterday],
      asOf: at(7, 0),
    });
    const morning = comparison.windows.find((window) => window.code === "morning_check");
    expect(morning?.status).toBe("in_progress");
    expect(morning?.eventIds).not.toContain("yesterday");
    expect(comparison.windows.find((window) => window.code === "wake")?.status).toBe("in_progress");
  });

  it("notes movement after the settle time without drafting a check-in", () => {
    const events = buildSimulatedEvents("restless-evening", day);
    const comparison = compareBaseline({
      baseline: defaultBaseline,
      events,
      asOf: at(23, 0),
    });
    const settle = comparison.windows.find((window) => window.code === "settle");
    expect(settle?.status).toBe("missed");
    expect(settle?.checkIn).toBe(false);
    expect(settle?.detail).toContain("22:20");
    expect(comparison.windows.find((window) => window.code === "morning_check")?.checkIn).toBe(false);
  });

  it("marks a missed lunch when the kitchen stays quiet", () => {
    const comparison = compareBaseline({
      baseline: defaultBaseline,
      events: buildSimulatedEvents("quiet-morning", day).filter((event) => event.role !== "kitchen"),
      asOf: at(14, 0),
    });
    expect(comparison.windows.find((window) => window.code === "lunch")?.status).toBe("missed");
  });
});
