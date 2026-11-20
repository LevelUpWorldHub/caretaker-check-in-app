import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/llm/route";

function request(router: string | null, auth = "Bearer visitor-key") {
  const headers: Record<string, string> = { "content-type": "application/json", authorization: auth };
  if (router !== null) headers["x-router-base"] = router;
  return new Request("https://mallbot-caretaker.vercel.app/api/llm", {
    method: "POST",
    headers,
    body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("/api/llm router proxy", () => {
  it("refuses non-allowlisted, private, and IPv6 routers before any fetch", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    for (const router of [
      "https://example.com/v1",
      "https://10.0.0.1/v1",
      "https://[::ffff:a9fe:a9fe]/v1",
      "https://169.254.169.254/latest",
      "https://localhost/v1",
      "http://api.x.ai/v1",
      "https://api.x.ai:8443/v1",
    ]) {
      const response = await POST(request(router));
      expect(response.status, router).toBe(400);
      const body = (await response.json()) as { error: string; code: string };
      expect(body.error).toBe("bad_router");
      expect(body.code).toMatch(/^router_/);
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it("does not follow redirects or echo the upstream body", async () => {
    const spy = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.redirect).toBe("manual");
      return new Response("<html>Example Domain internal page</html>", { status: 302, headers: { location: "http://169.254.169.254/" } });
    });
    vi.stubGlobal("fetch", spy);
    const response = await POST(request("https://api.x.ai/v1"));
    const text = await response.text();
    expect(response.status).toBe(502);
    expect(text).not.toMatch(/Example|internal|html/i);
    expect(spy).toHaveBeenCalled();
  });

  it("forwards to an allowlisted provider", async () => {
    const spy = vi.fn(async (url: string) => {
      expect(url).toBe("https://api.otari.ai/api/v1/chat/completions");
      return Response.json({ choices: [{ message: { content: "hello" } }] });
    });
    vi.stubGlobal("fetch", spy);
    const response = await POST(request("https://api.otari.ai/api/v1"));
    expect(response.status).toBe(200);
    expect(((await response.json()) as { content: string }).content).toBe("hello");
  });
});
