import { inferRole } from "@/lib/baseline";
import {
  assertMetadataPath,
  classifyRingStatus,
  nextHistoryPath,
  parseDevices,
  parseHistoryEvents,
  planRingReads,
  ringEventHistoryPath,
} from "@/lib/ring";
import { HttpStatusError, isRetryable, withResilience } from "@/lib/resilience";
import type { CareEvent, DeviceRole, RingDevice } from "@/lib/types";
import { localDayBounds } from "@/lib/time";

export const dynamic = "force-dynamic";

const BASE = (process.env.RING_API_BASE || "https://api.amazonvision.com").replace(/\/$/, "");

async function ringGet(path: string, token: string): Promise<{ value: unknown; attempts: number }> {
  assertMetadataPath(path);
  return withResilience(
    async (signal) => {
      const response = await fetch(`${BASE}${path}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        signal,
        cache: "no-store",
      });
      if (!response.ok) throw new HttpStatusError(response.status);
      return response.json();
    },
    {
      timeoutMs: 8_000,
      retries: 2,
      retryOn: isRetryable,
      backoffMs: (attempt) => 300 * attempt,
    },
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, code: "error", message: "Send a JSON body." }, { status: 400 });
  }
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const token = typeof record.token === "string" ? record.token.trim() : "";
  if (token.length < 20) {
    return Response.json(
      { ok: false, code: "error", message: "Paste a Playground token first." },
      { status: 400 },
    );
  }
  const offset = typeof record.timezoneOffsetMinutes === "number" ? record.timezoneOffsetMinutes : 0;
  const roles =
    record.deviceRoles && typeof record.deviceRoles === "object"
      ? (record.deviceRoles as Record<string, DeviceRole>)
      : {};

  let attempts = 0;
  try {
    planRingReads([]);
    const devicesResult = await ringGet("/v1/devices", token);
    attempts += devicesResult.attempts;
    const devices = parseDevices(devicesResult.value).slice(0, 5).map((device) => ({
      ...device,
      role: roles[device.id] ?? device.role ?? inferRole(device.name),
    }));
    const bounds = localDayBounds(new Date(), offset);
    const events: CareEvent[] = [];
    for (const device of devices) {
      let path: string | null = `${ringEventHistoryPath(device.id)}?event_types=${encodeURIComponent("ding,motion")}`;
      for (let page = 0; path && page < 3; page += 1) {
        const pageResult = await ringGet(path, token);
        attempts += pageResult.attempts;
        const pageEvents = parseHistoryEvents(pageResult.value, [device], roles);
        events.push(...pageEvents.filter((event) => event.startMs >= bounds.start && event.startMs < bounds.end));
        const oldest = pageEvents.reduce((min, event) => Math.min(min, event.startMs), Number.POSITIVE_INFINITY);
        path = oldest < bounds.start ? null : nextHistoryPath(pageResult.value);
      }
    }
    const unique = new Map<string, CareEvent>();
    for (const event of events) unique.set(event.id, event);
    return Response.json({
      ok: true,
      code: "ok",
      attempts,
      devices: devices satisfies RingDevice[],
      events: [...unique.values()].sort((a, b) => a.startMs - b.startMs),
      message: "Synced door and motion metadata. No video was requested.",
    });
  } catch (error) {
    const status = error instanceof HttpStatusError ? error.status : 0;
    const kind = status ? classifyRingStatus(status) : "error";
    if (kind === "expired" || kind === "forbidden") {
      return Response.json({
        ok: false,
        code: "expired",
        attempts,
        message:
          "That Playground token is expired or not accepted. Generate a new one and paste it here. No video was requested.",
      });
    }
    console.error("ring sync failed", status || "network");
    return Response.json({
      ok: false,
      code: "error",
      attempts,
      message:
        "Ring didn't answer after retries. The simulated feed can stay on so the day remains readable. No video was requested.",
    });
  }
}
