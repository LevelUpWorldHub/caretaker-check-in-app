import { describe, expect, it } from "vitest";
import { compareBaseline } from "@/lib/baseline";
import { defaultBaseline } from "@/lib/defaults";
import { buildChatBody, buildResponsesBody, notePayload, settleNote } from "@/lib/note";
import { buildSimulatedEvents } from "@/lib/simulate";

const day = new Date(2026, 10, 13, 10, 45, 0);

describe("Grok note request", () => {
  const events = buildSimulatedEvents("quiet-morning", day).filter((event) => event.startMs <= day.getTime());
  const comparison = compareBaseline({ baseline: defaultBaseline, events, asOf: day });
  const payload = notePayload({ relativeName: "Elena", comparison, events });

  it("sends no search tools and no Ring token", () => {
    const responses = buildResponsesBody({ ...payload, model: "grok-4.7" });
    const chat = buildChatBody({ ...payload, model: "grok-4.7" });
    for (const body of [responses, chat]) {
      expect(body).not.toHaveProperty("tools");
      const serialized = JSON.stringify(body);
      expect(serialized).not.toContain("web_search");
      expect(serialized).not.toContain("x_search");
      expect(serialized).not.toContain("ringToken");
      expect(serialized).not.toContain("deviceId");
    }
    expect(responses.model).toBe("grok-4.7");
  });

  it("holds back a diagnosis and shows the template instead", () => {
    const note = settleNote({
      modelText: JSON.stringify({
        lines: [{ text: "Elena had a stroke this morning.", eventIds: ["not-a-real-event"] }],
      }),
      model: "grok-4.7",
      relativeName: "Elena",
      comparison,
      events,
    });
    expect(note.source).toBe("template");
    expect(note.verifier.heldBack).toBe(true);
    expect(note.lines.map((line) => line.text).join(" ")).not.toMatch(/stroke/i);
    expect(note.lines.some((line) => line.eventIds.includes("not-a-real-event"))).toBe(false);
  });

  it("keeps a calm model note and drops unknown event ids", () => {
    const note = settleNote({
      modelText: JSON.stringify({
        lines: [
          {
            text: "The first motion after the morning check was in the hallway.",
            eventIds: ["sim-quiet-morning-1", "made-up"],
          },
        ],
      }),
      model: "grok-4.7",
      relativeName: "Elena",
      comparison,
      events,
    });
    expect(note.source).toBe("grok");
    expect(note.lines[0]?.eventIds).toEqual(["sim-quiet-morning-1"]);
    expect(note.verifier.passed).toBe(true);
  });

  it("uses the template when there is no model text", () => {
    const note = settleNote({
      modelText: null,
      relativeName: "Elena",
      comparison,
      events,
      failureDetail: "No key.",
    });
    expect(note.source).toBe("template");
    expect(note.verifier.heldBack).toBe(false);
    expect(note.detail).toBe("No key.");
  });
});
