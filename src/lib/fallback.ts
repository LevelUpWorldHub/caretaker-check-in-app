import type { CareEvent, Comparison, DailyNote, NoteLine } from "@/lib/types";
import { verifyLines } from "@/lib/verifier";

const SAFE_LINE =
  "Today's note is limited to whether door and motion times matched the routine you saved.";

export function fallbackLines(comparison: Comparison): NoteLine[] {
  const active = comparison.windows.filter((window) => window.status !== "upcoming");
  const upcoming = comparison.windows.filter((window) => window.status === "upcoming");
  const lines: NoteLine[] = active.map((window) => ({
    text: window.detail,
    eventIds: window.eventIds,
  }));
  if (upcoming.length) {
    lines.push({
      text: `Still ahead: ${upcoming.map((window) => window.label.toLowerCase()).join(", ")}.`,
      eventIds: [],
    });
  }
  lines.push({
    text: "This note only compares event times with the routine you saved. It is not a health assessment.",
    eventIds: [],
  });
  return lines;
}

export function fallbackNote(input: {
  comparison: Comparison;
  events: CareEvent[];
  generatedAt?: string;
  detail?: string;
  heldBack?: boolean;
  reasons?: string[];
}): DailyNote {
  const known = new Set(input.events.map((event) => event.id));
  let lines = fallbackLines(input.comparison).map((line) => ({
    text: line.text,
    eventIds: line.eventIds.filter((id) => known.has(id)),
  }));
  const verdict = verifyLines(lines);
  if (!verdict.ok) {
    lines = [{ text: SAFE_LINE, eventIds: [] }];
  }
  return {
    source: "template",
    lines,
    verifier: {
      passed: input.heldBack ? false : verifyLines(lines).ok,
      reasons: input.reasons ?? [],
      heldBack: Boolean(input.heldBack),
    },
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    detail:
      input.detail ??
      "Template note. Each line comes from the routine comparison, with no model call.",
  };
}
