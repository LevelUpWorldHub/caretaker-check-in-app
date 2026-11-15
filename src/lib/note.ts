import { fallbackNote } from "@/lib/fallback";
import type { CareEvent, Comparison, DailyNote, NoteLine } from "@/lib/types";
import { verifyLines } from "@/lib/verifier";

export type NotePayload = {
  relativeName: string;
  comparison: Comparison;
  events: Array<
    Pick<CareEvent, "id" | "deviceName" | "role" | "eventType" | "subtype" | "startMs">
  >;
};

const SYSTEM = [
  "You write a calm daily note for a caregiver.",
  "Use only the JSON facts in the user message. Never invent events, times, or devices.",
  "Each line must be supported by the window detail or by event ids from the list.",
  "Return JSON only: {\"lines\":[{\"text\":\"...\",\"eventIds\":[\"...\"]}]}.",
  "Do not diagnose, name a medical condition, or say there is an emergency.",
  "Do not tell anyone to call emergency services.",
  "Do not use web search, X search, or any tool. Care details stay in this request.",
  "Tone: short, warm, and factual. Speak to the caregiver about routine timing.",
].join(" ");

export function notePayload(input: {
  relativeName: string;
  comparison: Comparison;
  events: CareEvent[];
}): NotePayload {
  return {
    relativeName: input.relativeName,
    comparison: input.comparison,
    events: input.events.map((event) => ({
      id: event.id,
      deviceName: event.deviceName,
      role: event.role,
      eventType: event.eventType,
      subtype: event.subtype,
      startMs: event.startMs,
    })),
  };
}

export function buildResponsesBody(input: NotePayload & { model: string }) {
  return {
    model: input.model,
    temperature: 0.2,
    store: false,
    input: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: JSON.stringify({
          relativeName: input.relativeName,
          windows: input.comparison.windows,
          events: input.events,
        }),
      },
    ],
  };
}

export function buildChatBody(input: NotePayload & { model: string }) {
  return {
    model: input.model,
    temperature: 0.2,
    stream: false,
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: JSON.stringify({
          relativeName: input.relativeName,
          windows: input.comparison.windows,
          events: input.events,
        }),
      },
    ],
  };
}

export function extractGrokText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  if (typeof record.output_text === "string" && record.output_text.trim()) {
    return record.output_text;
  }
  if (Array.isArray(record.output)) {
    const parts: string[] = [];
    for (const item of record.output) {
      if (!item || typeof item !== "object") continue;
      const content = (item as { content?: unknown }).content;
      if (typeof content === "string") parts.push(content);
      if (Array.isArray(content)) {
        for (const part of content) {
          if (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string") {
            parts.push((part as { text: string }).text);
          }
        }
      }
    }
    if (parts.length) return parts.join("\n");
  }
  const choices = record.choices;
  if (Array.isArray(choices) && choices[0] && typeof choices[0] === "object") {
    const message = (choices[0] as { message?: { content?: unknown } }).message;
    if (typeof message?.content === "string") return message.content;
  }
  return null;
}

export function parseModelLines(text: string): NoteLine[] | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced?.[1] ?? text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as { lines?: unknown };
    if (!Array.isArray(parsed.lines) || parsed.lines.length === 0) return null;
    const lines: NoteLine[] = [];
    for (const line of parsed.lines) {
      if (!line || typeof line !== "object") return null;
      const textValue = (line as { text?: unknown }).text;
      const ids = (line as { eventIds?: unknown }).eventIds;
      if (typeof textValue !== "string" || !textValue.trim()) return null;
      if (ids !== undefined && !Array.isArray(ids)) return null;
      lines.push({
        text: textValue.trim(),
        eventIds: Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [],
      });
    }
    return lines;
  } catch {
    return null;
  }
}

export function settleNote(input: {
  modelText: string | null;
  model?: string;
  failureDetail?: string | null;
  relativeName: string;
  comparison: Comparison;
  events: CareEvent[];
  generatedAt?: string;
}): DailyNote {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const template = (detail: string, heldBack: boolean, reasons: string[] = []) =>
    fallbackNote({
      comparison: input.comparison,
      events: input.events,
      generatedAt,
      detail,
      heldBack,
      reasons,
    });

  if (!input.modelText) {
    return template(
      input.failureDetail ??
        "Template note. Grok was not called, so each line comes from the routine comparison.",
      false,
    );
  }

  const parsed = parseModelLines(input.modelText);
  if (!parsed) {
    return template(
      "The model reply was not usable JSON. The template note is shown instead.",
      true,
      ["unusable model reply"],
    );
  }

  const known = new Set(input.events.map((event) => event.id));
  const lines = parsed.map((line) => ({
    text: line.text,
    eventIds: line.eventIds.filter((id) => known.has(id)),
  }));
  const verdict = verifyLines(lines);
  if (!verdict.ok) {
    return template(
      `A model draft was held back (${verdict.reasons.join(", ")}). This template note is the one on the page.`,
      true,
      verdict.reasons,
    );
  }

  return {
    source: "grok",
    model: input.model,
    lines,
    verifier: { passed: true, reasons: [], heldBack: false },
    generatedAt,
    detail: input.model
      ? `Written by ${input.model} from today's event metadata. No web or X search was used.`
      : "Written from today's event metadata. No web or X search was used.",
  };
}
