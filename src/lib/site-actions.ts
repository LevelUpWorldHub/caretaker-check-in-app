import type { JsonSchema, SiteAction } from "@/lib/runtime";

const timeField = { type: "string", description: "24-hour time HH:MM" };

export const baselinePatchSchema: JsonSchema = {
  type: "object",
  properties: {
    wakeStart: timeField,
    wakeEnd: timeField,
    morningCheckBy: timeField,
    doorStart: timeField,
    doorEnd: timeField,
    lunchStart: timeField,
    lunchEnd: timeField,
    dinnerStart: timeField,
    dinnerEnd: timeField,
    eveningStart: timeField,
    eveningSettleBy: timeField,
  },
};

export const draftSchema: JsonSchema = {
  type: "object",
  properties: {
    message: { type: "string", description: "The gentle check-in wording. It is not sent." },
    reason: { type: "string", description: "Why this draft exists, in plain language." },
  },
  required: ["message"],
};

export const readSchema: JsonSchema = {
  type: "object",
  properties: {},
};

export function createSiteActions(handlers: {
  read: () => unknown;
  draft: (args: Record<string, unknown>) => unknown;
  updateBaseline: (args: Record<string, unknown>) => unknown;
}): SiteAction[] {
  return [
    {
      name: "get_care_state",
      description:
        "Read today's routine comparison, event metadata, daily note, and any unsent check-in drafts. Never returns video or tokens.",
      effect: "read",
      schema: readSchema,
      handler: () => handlers.read(),
    },
    {
      name: "draft_check_in",
      description:
        "Save a gentle check-in draft for the caregiver to approve. This does not send a message.",
      effect: "write",
      schema: draftSchema,
      handler: (args) => handlers.draft(args),
    },
    {
      name: "update_baseline",
      description: "Update saved routine times after the caregiver confirms the change.",
      effect: "write",
      schema: baselinePatchSchema,
      handler: (args) => handlers.updateBaseline(args),
    },
  ];
}
