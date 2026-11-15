import { describe, expect, it } from "vitest";
import { fallbackNote } from "@/lib/fallback";
import { compareBaseline } from "@/lib/baseline";
import { defaultBaseline } from "@/lib/defaults";
import { buildSimulatedEvents } from "@/lib/simulate";
import { verifyLines, verifyText } from "@/lib/verifier";

const day = new Date(2026, 10, 13, 10, 45, 0);

describe("verifier", () => {
  it("allows a calm routine note and a disclaimer", () => {
    expect(verifyText("No door or motion events arrived before 09:30.").ok).toBe(true);
    expect(verifyText("This note only compares event times. It is not a health assessment.").ok).toBe(true);
    expect(verifyText("This is a small check-in, not an alarm. It has not been sent.").ok).toBe(true);
  });

  it("blocks diagnoses and emergency claims", () => {
    expect(verifyText("Elena may have had a stroke.").ok).toBe(false);
    expect(verifyText("Call 911, this is a medical emergency.").reasons).toContain("emergency claim");
    expect(verifyText("She has fallen and is injured.").ok).toBe(false);
    expect(verifyText("The note diagnosed dementia.").reasons).toContain("medical diagnosis");
  });
});

describe("template fallback", () => {
  it("produces cited bullets that pass the verifier and drops unknown ids", () => {
    const events = buildSimulatedEvents("quiet-morning", day).filter((event) => event.startMs <= day.getTime());
    const comparison = compareBaseline({ baseline: defaultBaseline, events, asOf: day });
    const note = fallbackNote({ comparison, events });
    expect(note.source).toBe("template");
    expect(note.verifier.passed).toBe(true);
    expect(verifyLines(note.lines).ok).toBe(true);
    const cited = note.lines.flatMap((line) => line.eventIds);
    expect(cited).toContain("sim-quiet-morning-1");
    expect(cited.every((id) => events.some((event) => event.id === id))).toBe(true);
    expect(note.lines.some((line) => line.text.includes("09:30"))).toBe(true);
  });

  it("replaces a poisoned comparison with a safe line", () => {
    const events = buildSimulatedEvents("quiet-morning", day);
    const comparison = compareBaseline({ baseline: defaultBaseline, events, asOf: day });
    comparison.windows[0]!.detail = "Elena had a stroke.";
    comparison.windows[0]!.status = "missed";
    const note = fallbackNote({ comparison, events });
    expect(note.lines.map((line) => line.text).join(" ")).not.toMatch(/stroke/i);
    expect(verifyLines(note.lines).ok).toBe(true);
  });
});
