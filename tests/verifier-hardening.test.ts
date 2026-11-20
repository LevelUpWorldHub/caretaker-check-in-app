import { describe, expect, it } from "vitest";
import { compareBaseline } from "@/lib/baseline";
import { checkInUpdateError, draftCheckInMessage, withCheckInStatus } from "@/lib/checkin";
import { defaultBaseline } from "@/lib/defaults";
import { fallbackLines } from "@/lib/fallback";
import { groundedComplete } from "@/lib/grounded";
import { buildSimulatedEvents } from "@/lib/simulate";
import type { CheckIn, Scenario } from "@/lib/types";
import { verifyText } from "@/lib/verifier";

const MUST_BLOCK = [
  "Mom has fallen in the kitchen. This is not a medical emergency.",
  "She collapsed near the stairs, but nothing was sent.",
  "Dad may have had a stroke; this is not an alarm.",
  "Grandma fell in the bathroom this morning.",
  "He diagnoses himself with the flu.",
  "Signs of strokes were seen.",
  "She had two seizures overnight.",
  "She passed out after breakfast.",
  "He fainted in the hallway.",
  "She broke her hip.",
  "He was hospitalized yesterday.",
  "Mom seems confused and disoriented, possibly early-stage cognitive decline.",
  "Take her to the emergency room.",
  "Dial 911 now.",
  "Call 9-1-1.",
  "He is bleeding.",
  "Possible heart failure.",
  "Likely Parkinson's.",
  "This looks like cancer.",
  "di\u200bagnosis: dementia-like pattern",
  "d\u0456agnosis pending",
  "DEMENTIA",
  "Alzheimer\u2019s is likely.",
  "She is in danger.",
  "He needs a doctor right away.",
  "Unresponsive since 9am.",
];

const MUST_ALLOW = [
  "Mom made coffee at 8:10, about her usual time.",
  "The kitchen motion was quiet until 9:30. This is not a health assessment.",
  "A stroke of luck: she was out gardening.",
  "Dad watched the stroke-play golf final.",
  "She played a game called Fall Guys.",
  "No door or motion events fell inside the wake window 07:00-08:30.",
  "This is a small check-in, not an alarm. It has not been sent.",
];

describe("verifier hardening", () => {
  it.each(MUST_BLOCK)("blocks %j", (text) => {
    expect(verifyText(text).ok).toBe(false);
  });

  it.each(MUST_ALLOW)("allows %j", (text) => {
    expect(verifyText(text).ok).toBe(true);
  });

  it("does not let a disclaimer hide a claim in the same sentence", () => {
    expect(verifyText("Elena collapsed in the hallway, but nothing was sent.").ok).toBe(false);
    expect(verifyText("Not an alarm, but she may have had a stroke.").ok).toBe(false);
  });

  it("scans 250 KB of text in under 50 ms", () => {
    const inputs = ["word ".repeat(50_000), "a".repeat(250_000) + " not a health assessment", "nothing was sent ".repeat(15_000), ".".repeat(250_000)];
    for (const text of inputs) {
      const start = performance.now();
      verifyText(text);
      expect(performance.now() - start).toBeLessThan(50);
    }
  });

  it("lets every scenario's routine lines and the auto draft pass", () => {
    const day = new Date(2026, 10, 13, 10, 45, 0);
    for (const scenario of ["quiet-morning", "steady", "restless-evening"] as Scenario[]) {
      for (const hour of [7, 9, 10, 12, 18, 23]) {
        const asOf = new Date(2026, 10, 13, hour, 30, 0);
        const events = buildSimulatedEvents(scenario, day).filter((event) => event.startMs <= asOf.getTime());
        const comparison = compareBaseline({ baseline: defaultBaseline, events, asOf });
        for (const line of fallbackLines(comparison)) expect(verifyText(line.text).ok, line.text).toBe(true);
        expect(() =>
          draftCheckInMessage({ caregiverName: "Mark", relativeName: "Elena", baseline: defaultBaseline, comparison, events }),
        ).not.toThrow();
      }
    }
  });
});

describe("check-in status changes", () => {
  const item: CheckIn = {
    id: "c1",
    dayKey: "2026-11-13",
    code: "manual",
    reason: "test",
    message: "Hello, a short hello would be welcome.",
    eventIds: [],
    status: "draft",
    createdAt: "2026-11-13T10:00:00.000Z",
    updatedAt: "2026-11-13T10:00:00.000Z",
    autonomous: false,
    sent: false,
  };

  it("reports flagged wording before any state change", () => {
    expect(checkInUpdateError("approved", "Elena may have had a stroke.")).toMatch(/can't be saved/);
    expect(checkInUpdateError("copied", "Elena may have had a stroke.")).toMatch(/can't be saved/);
    expect(checkInUpdateError("approved", "A short hello would be welcome.")).toBeNull();
    expect(checkInUpdateError("dismissed", "Elena may have had a stroke.")).toBeNull();
  });

  it("dismisses without saving flagged wording and never throws", () => {
    const next = withCheckInStatus([item], "c1", "dismissed", "Elena may have had a stroke.");
    expect(next[0]?.status).toBe("dismissed");
    expect(next[0]?.message).toBe(item.message);
  });
});

describe("grounded routing", () => {
  const tools = ["routine_reader", "checkin_drafter", "care_glossary"].map((name) => ({
    type: "function" as const,
    function: { name, description: name, parameters: { type: "object", properties: {} } },
  }));

  it("answers the glossary sample query without opening a draft", () => {
    const question = "What is a check-in, and do you watch video?";
    const first = groundedComplete({ agent: "care_companion", messages: [{ role: "user", content: question }], tools });
    expect(first.toolCalls?.map((call) => call.name)).toEqual(["care_glossary"]);
    const second = groundedComplete({
      agent: "care_companion",
      messages: [
        { role: "user", content: question },
        { role: "assistant", content: "", tool_calls: [{ id: "g1", type: "function", function: { name: "care_glossary", arguments: "{}" } }] },
        { role: "tool", tool_call_id: "g1", content: "A check-in is a short note you approve. The app reads door and motion times, not video." },
      ],
      tools,
    });
    expect(second.toolCalls ?? []).toEqual([]);
    expect(second.content).toMatch(/check-in/i);
  });

  it("still drafts on an explicit request", () => {
    const response = groundedComplete({
      agent: "care_companion",
      messages: [{ role: "user", content: "Draft a gentle check-in for me to approve." }],
      tools,
    });
    expect(response.toolCalls?.map((call) => call.name)).toEqual(["checkin_drafter"]);
  });
});
