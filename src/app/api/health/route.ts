import { classifyRingStatus } from "@/lib/ring";

export const dynamic = "force-dynamic";

export async function GET() {
  const base = (process.env.RING_API_BASE || "https://api.amazonvision.com").replace(/\/$/, "");
  let ring: { state: "ok" | "degraded" | "down"; detail: string } = {
    state: "down",
    detail: "Ring host did not answer in time.",
  };
  try {
    const response = await fetch(`${base}/v1/devices`, {
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    });
    const kind = classifyRingStatus(response.status);
    if (kind === "expired" || kind === "forbidden" || kind === "ok") {
      ring = {
        state: "ok",
        detail: "The Ring host answered an unauthenticated check, so the API is reachable. No token was sent.",
      };
    } else {
      ring = { state: "degraded", detail: `The Ring host returned HTTP ${response.status}.` };
    }
  } catch {
    ring = { state: "down", detail: "The Ring host did not answer within 5 seconds." };
  }

  return Response.json({
    app: "ok",
    grokConfigured: Boolean(process.env.XAI_API_KEY),
    model: process.env.XAI_MODEL || "grok-4.7",
    searchEnabled: false,
    ring,
  });
}
