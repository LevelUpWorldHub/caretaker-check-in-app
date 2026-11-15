import { describe, expect, it } from "vitest";
import { compareBaseline } from "@/lib/baseline";
import {
  draftCheckInMessage,
  reconcileCheckIns,
  withCheckInStatus,
} from "@/lib/checkin";
import { defaultBaseline } from "@/lib/defaults";
import { buildSimulatedEvents } from "@/lib/simulate";
import { verifyText } from "@/lib/verifier";

const day = new Date(2026, 10, 13, 10, 45, 0);
const quietEvents = buildSimulatedEvents("quiet-morning", day).filter((event) => event.startMs <= day.getTime());
const quiet = compareBaseline({ baseline: defaultBaseline, events: quietEvents, asOf: day });

describe("check-ins", () => {
  it("drafts one unsent message and does not duplicate it", () => {
    const first = reconcileCheckIns({
      existing: [],
      comparison: quiet,
      baseline: defaultBaseline,
      events: quietEvents,
      relativeName: "Elena",
      caregiverName: "Alex",
    });
    expect(first).toHaveLength(1);
    expect(first[0]?.sent).toBe(false);
    expect(first[0]?.status).toBe("draft");
    expect(first[0]?.autonomous).toBe(true);
    expect(first[0]?.id).toBe("2026-11-13:morning_check");
    expect(verifyText(first[0]!.message).ok).toBe(true);
    expect(first[0]?.message).toContain("has not been sent");
    const second = reconcileCheckIns({
      existing: first,
      comparison: quiet,
      baseline: defaultBaseline,
      events: quietEvents,
      relativeName: "Elena",
      caregiverName: "Alex",
    });
    expect(second).toHaveLength(1);
  });

  it("removes a stale autonomous draft when the morning matches", () => {
    const drafted = reconcileCheckIns({
      existing: [],
      comparison: quiet,
      baseline: defaultBaseline,
      events: quietEvents,
      relativeName: "Elena",
      caregiverName: "",
    });
    const steady = compareBaseline({
      baseline: defaultBaseline,
      events: buildSimulatedEvents("steady", day),
      asOf: day,
    });
    const next = reconcileCheckIns({
      existing: drafted,
      comparison: steady,
      baseline: defaultBaseline,
      events: buildSimulatedEvents("steady", day),
      relativeName: "Elena",
      caregiverName: "",
    });
    expect(next.some((item) => item.status === "draft" && item.autonomous)).toBe(false);
  });

  it("keeps an approved draft and never flips sent", () => {
    const drafted = reconcileCheckIns({
      existing: [],
      comparison: quiet,
      baseline: defaultBaseline,
      events: quietEvents,
      relativeName: "Elena",
      caregiverName: "",
    });
    const approved = withCheckInStatus(drafted, drafted[0]!.id, "approved");
    expect(approved[0]?.status).toBe("approved");
    expect(approved[0]?.sent).toBe(false);
    const steady = compareBaseline({
      baseline: defaultBaseline,
      events: buildSimulatedEvents("steady", day),
      asOf: day,
    });
    const next = reconcileCheckIns({
      existing: approved,
      comparison: steady,
      baseline: defaultBaseline,
      events: buildSimulatedEvents("steady", day),
      relativeName: "Elena",
      caregiverName: "",
    });
    expect(next[0]?.status).toBe("approved");
    expect(next[0]?.sent).toBe(false);
  });

  it("returns null when the morning is not missed", () => {
    const steady = compareBaseline({
      baseline: defaultBaseline,
      events: buildSimulatedEvents("steady", day),
      asOf: day,
    });
    expect(
      draftCheckInMessage({
        caregiverName: "",
        relativeName: "Elena",
        baseline: defaultBaseline,
        comparison: steady,
        events: buildSimulatedEvents("steady", day),
      }),
    ).toBeNull();
  });
});
