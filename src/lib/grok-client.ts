import { buildChatBody, buildResponsesBody, extractGrokText, type NotePayload } from "@/lib/note";
import { HttpStatusError, isRetryable, withResilience } from "@/lib/resilience";
import { assertNoSearch } from "@/lib/sanitize";

async function postJson(url: string, apiKey: string, body: unknown): Promise<unknown> {
  assertNoSearch(body);
  const { value } = await withResilience(
    async (signal) => {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal,
      });
      if (!response.ok) throw new HttpStatusError(response.status);
      return response.json();
    },
    { timeoutMs: 25_000, retries: 1, retryOn: isRetryable, backoffMs: () => 400 },
  );
  return value;
}

export async function requestGrokNote(input: {
  apiKey: string;
  model: string;
  payload: NotePayload;
  baseUrl?: string;
}): Promise<string> {
  const base = (input.baseUrl || "https://api.x.ai/v1").replace(/\/$/, "");
  const responsesBody = buildResponsesBody({ ...input.payload, model: input.model });
  try {
    const payload = await postJson(`${base}/responses`, input.apiKey, responsesBody);
    const text = extractGrokText(payload);
    if (text) return text;
  } catch (error) {
    const status = error instanceof HttpStatusError ? error.status : 0;
    if (![400, 404, 405, 501].includes(status)) throw error;
  }
  const chatBody = buildChatBody({ ...input.payload, model: input.model });
  const payload = await postJson(`${base}/chat/completions`, input.apiKey, chatBody);
  const text = extractGrokText(payload);
  if (!text) throw new Error("Grok returned no text.");
  return text;
}
