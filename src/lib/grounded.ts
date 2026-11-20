import type { ModelResponse, ModelTool, LlmMessage } from "@/lib/runtime";

function calledNames(messages: LlmMessage[]): Set<string> {
  const names = new Set<string>();
  for (const message of messages) {
    if (message.role === "assistant" && message.tool_calls) {
      for (const call of message.tool_calls) names.add(call.function.name);
    }
  }
  return names;
}

function lastUser(messages: LlmMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message && message.role === "user") return message.content;
  }
  return "";
}

function lastTool(messages: LlmMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message && message.role === "tool") return message.content;
  }
  return "";
}

function has(tools: ModelTool[], name: string): boolean {
  return tools.some((tool) => tool.function.name === name);
}

function call(name: string, args: Record<string, unknown>): ModelResponse {
  return {
    content: "",
    toolCalls: [{ id: `call_${name}`, name, arguments: args }],
  };
}

function summarize(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as {
      result?: unknown;
      name?: string;
    };
    const result = parsed.result;
    if (typeof result === "string") return result;
    if (result && typeof result === "object") {
      const state = result as {
        relativeName?: string;
        asOfLabel?: string;
        windows?: { label: string; detail: string; status: string }[];
        note?: { source?: string; lines?: { text: string }[] };
        pendingCheckIns?: { message: string }[];
        suggestedCheckIn?: string | null;
      };
      const windows = (state.windows ?? [])
        .filter((window) => window.status !== "upcoming")
        .map((window) => `${window.label}: ${window.detail}`)
        .join("\n");
      const note = (state.note?.lines ?? []).map((line) => line.text).join(" ");
      const pending = state.pendingCheckIns?.length
        ? `A check-in draft is waiting for approval. Nothing has been sent.`
        : "No check-in is waiting.";
      return [
        `Here is today's comparison for ${state.relativeName ?? "them"}${state.asOfLabel ? `, as of ${state.asOfLabel}` : ""}.`,
        windows,
        note ? `Daily note (${state.note?.source ?? "template"}): ${note}` : "",
        pending,
        "I can draft a gentle check-in, and you approve it before it exists as a message you can copy.",
      ]
        .filter(Boolean)
        .join("\n\n");
    }
  } catch {
    return raw;
  }
  return "I read the page, and I still need a clearer question about today's routine.";
}

export function groundedComplete(input: {
  agent: string;
  messages: LlmMessage[];
  tools: ModelTool[];
}): ModelResponse {
  const names = calledNames(input.messages);
  const userText = lastUser(input.messages);
  const wantsGlossary = /glossary|what (?:is|are) (?:a )?check-?ins?\b|metadata|video|what does .* mean/i.test(userText);
  // A question about what a check-in is must never open a draft. Only an explicit request drafts one.
  const wantsDraft =
    !wantsGlossary && /check-?in|draft a|write a (?:note|message)|reach out|say hello/i.test(userText);

  if (input.agent === "care_companion") {
    if (wantsGlossary && has(input.tools, "care_glossary")) {
      if (!names.has("care_glossary")) return call("care_glossary", { inquiry: userText });
      const answer = lastTool(input.messages);
      if (answer) return { content: summarize(answer) };
    }
    if (wantsDraft && has(input.tools, "checkin_drafter") && !names.has("checkin_drafter")) {
      return call("checkin_drafter", { reason: userText });
    }
    if (has(input.tools, "routine_reader") && !names.has("routine_reader") && !wantsDraft) {
      return call("routine_reader", { question: userText });
    }
    const tool = lastTool(input.messages);
    if (tool) return { content: summarize(tool) };
  }

  if (
    input.agent === "glossary_guide" &&
    has(input.tools, "phrase_coach") &&
    !names.has("phrase_coach")
  ) {
    return call("phrase_coach", { inquiry: userText });
  }

  if (has(input.tools, "website_get_care_state") && !names.has("website_get_care_state")) {
    return call("website_get_care_state", {});
  }

  if (
    input.agent === "checkin_drafter" &&
    has(input.tools, "website_draft_check_in") &&
    names.has("website_get_care_state") &&
    !names.has("website_draft_check_in")
  ) {
    const raw = lastTool(input.messages);
    try {
      const parsed = JSON.parse(raw) as { result?: { suggestedCheckIn?: string | null; morningMissed?: boolean } };
      if (!parsed.result?.morningMissed || !parsed.result.suggestedCheckIn) {
        return {
          content:
            "Nothing in today's comparison asks for a check-in. I did not draft one, and nothing was sent.",
        };
      }
      return call("website_draft_check_in", {
        message: parsed.result.suggestedCheckIn,
        reason: "Morning routine deviation",
      });
    } catch {
      return { content: "I couldn't read today's comparison, so I did not draft a check-in." };
    }
  }

  if (input.agent === "checkin_drafter" && names.has("website_draft_check_in")) {
    const raw = lastTool(input.messages);
    if (raw.includes("did not confirm") || raw.includes('"ok":false') || raw.includes('"ok": false')) {
      return { content: "I didn't save a draft, because it wasn't confirmed. Nothing was sent." };
    }
    return {
      content: "I prepared a check-in draft for your approval. It is in Check-ins. Nothing was sent.",
    };
  }

  const tool = lastTool(input.messages);
  if (tool) return { content: summarize(tool) };

  if (input.tools.length === 0) {
    return {
      content:
        "A check-in here is a draft you approve yourself. The page reads door and motion metadata, never video, and it does not send messages.",
    };
  }

  return {
    content:
      "I can read today's routine comparison and draft a check-in for your approval. I can't send it.",
  };
}
