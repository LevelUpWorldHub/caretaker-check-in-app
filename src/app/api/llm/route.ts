import { HttpStatusError, isRetryable, withResilience } from "@/lib/resilience";
import { sanitizeModelTools, type ToolSpec } from "@/lib/sanitize";

export const dynamic = "force-dynamic";

type ToolCall = { id: string; name: string; arguments: Record<string, unknown> };

function routerFrom(header: string | null): string {
  const fallback = (process.env.XAI_BASE_URL || "https://api.x.ai/v1").replace(/\/$/, "");
  if (!header) return fallback;
  let url: URL;
  try {
    url = new URL(header);
  } catch {
    throw new Error("The router URL is not valid.");
  }
  if (url.protocol !== "https:") throw new Error("The router URL must use https.");
  if (url.username || url.password) throw new Error("Put the key in the key field, not in the URL.");
  return url.toString().replace(/\/$/, "");
}

function modelFrom(header: string | null, fallback: string): string {
  if (!header) return fallback;
  if (!/^[A-Za-z0-9._:/-]{1,80}$/.test(header)) return fallback;
  return header;
}

function parseCompletion(payload: unknown): { content: string; toolCalls: ToolCall[] } {
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const first = choices[0] && typeof choices[0] === "object" ? (choices[0] as Record<string, unknown>) : {};
  const message = first.message && typeof first.message === "object" ? (first.message as Record<string, unknown>) : {};
  const content = typeof message.content === "string" ? message.content : "";
  const rawCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  const toolCalls: ToolCall[] = [];
  for (const call of rawCalls) {
    if (!call || typeof call !== "object") continue;
    const row = call as { id?: unknown; function?: { name?: unknown; arguments?: unknown } };
    const name = row.function?.name;
    if (typeof name !== "string") continue;
    let args: Record<string, unknown> = {};
    if (typeof row.function?.arguments === "string") {
      try {
        const parsed = JSON.parse(row.function.arguments) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) args = parsed as Record<string, unknown>;
      } catch {
        args = {};
      }
    }
    toolCalls.push({ id: typeof row.id === "string" ? row.id : `call_${toolCalls.length + 1}`, name, arguments: args });
  }
  return { content, toolCalls };
}

export async function POST(request: Request) {
  const byok = request.headers.get("authorization");
  const siteKey = process.env.XAI_API_KEY;
  const usingVisitor = Boolean(byok);
  const apiKey = usingVisitor ? byok : siteKey ? `Bearer ${siteKey}` : "";
  if (!apiKey) {
    return Response.json(
      { error: "model_unavailable", message: "Add a key in the companion, or set XAI_API_KEY on the server." },
      { status: 503 },
    );
  }

  let router: string;
  try {
    router = routerFrom(usingVisitor ? request.headers.get("x-router-base") : null);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The router URL was rejected.";
    return Response.json({ error: "bad_router", message }, { status: 400 });
  }
  const model = modelFrom(
    usingVisitor ? request.headers.get("x-model") : null,
    process.env.XAI_MODEL || "grok-4.7",
  );

  let body: { messages?: unknown; tools?: ToolSpec[] };
  try {
    body = (await request.json()) as { messages?: unknown; tools?: ToolSpec[] };
  } catch {
    return Response.json({ error: "bad_body" }, { status: 400 });
  }
  if (!Array.isArray(body.messages)) {
    return Response.json({ error: "bad_body" }, { status: 400 });
  }
  const tools = sanitizeModelTools(Array.isArray(body.tools) ? body.tools : []);
  const payload: Record<string, unknown> = {
    model,
    temperature: 0.2,
    messages: body.messages,
  };
  if (tools.length) payload.tools = tools;

  try {
    const { value } = await withResilience(
      async (signal) => {
        const response = await fetch(`${router}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: apiKey.startsWith("Bearer ") ? apiKey : `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          signal,
        });
        if (!response.ok) throw new HttpStatusError(response.status);
        return response.json();
      },
      { timeoutMs: 25_000, retries: 1, retryOn: isRetryable, backoffMs: () => 400 },
    );
    return Response.json(parseCompletion(value));
  } catch (error) {
    const status = error instanceof HttpStatusError ? error.status : 0;
    console.error("llm proxy failed", status || "network");
    return Response.json(
      {
        error: "model_unavailable",
        message:
          status === 401
            ? "The key was rejected. Check it, or switch to grounded mode."
            : "The model didn't answer. Grounded mode can still read the page.",
      },
      { status: status === 401 ? 401 : 502 },
    );
  }
}
