import { notePayload, settleNote } from "@/lib/note";
import { requestGrokNote } from "@/lib/grok-client";
import type { CareEvent, Comparison } from "@/lib/types";

export const dynamic = "force-dynamic";

function asComparison(value: unknown): Comparison | null {
  if (!value || typeof value !== "object") return null;
  const windows = (value as Comparison).windows;
  if (!Array.isArray(windows)) return null;
  return value as Comparison;
}

function asEvents(value: unknown): CareEvent[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 80).filter((item): item is CareEvent => {
    if (!item || typeof item !== "object") return false;
    const event = item as CareEvent;
    return typeof event.id === "string" && typeof event.startMs === "number";
  });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send a JSON body." }, { status: 400 });
  }
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const comparison = asComparison(record.comparison);
  if (!comparison) {
    return Response.json({ error: "comparison.windows is required." }, { status: 400 });
  }
  const events = asEvents(record.events);
  const relativeName = typeof record.relativeName === "string" ? record.relativeName.slice(0, 80) : "them";
  const payload = notePayload({ relativeName, comparison, events });
  const model = process.env.XAI_MODEL || "grok-4.7";
  const apiKey = process.env.XAI_API_KEY;

  if (!apiKey) {
    return Response.json({
      note: settleNote({
        modelText: null,
        relativeName,
        comparison,
        events,
        failureDetail:
          "Template note. No XAI_API_KEY is set, so each line comes from the routine comparison. No web or X search was used.",
      }),
    });
  }

  try {
    const modelText = await requestGrokNote({
      apiKey,
      model,
      payload,
      baseUrl: process.env.XAI_BASE_URL,
    });
    return Response.json({
      note: settleNote({ modelText, model, relativeName, comparison, events }),
    });
  } catch (error) {
    const status = error instanceof Error ? error.message : "Grok did not answer.";
    console.error("note generation failed", status.slice(0, 120));
    return Response.json({
      note: settleNote({
        modelText: null,
        relativeName,
        comparison,
        events,
        failureDetail: "Grok did not answer in time. The template note is shown instead. No web or X search was used.",
      }),
    });
  }
}
