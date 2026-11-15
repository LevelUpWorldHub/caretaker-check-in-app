import type { CareEvent, DeviceRole, RingDevice } from "@/lib/types";
import { inferRole } from "@/lib/baseline";

const MEDIA = /\/media\/|\/streaming|\/download|whep|rtsp/i;

export function assertMetadataPath(path: string): void {
  const bare = path.split("?")[0] ?? path;
  if (MEDIA.test(path)) {
    throw new Error("Metadata only: refusing a media or stream path.");
  }
  const allowed =
    bare === "/v1/devices" || /^\/v1\/history\/devices\/[^/]+\/events$/.test(bare);
  if (!allowed) {
    throw new Error(`Path is not a metadata read: ${bare}`);
  }
}

export function ringEventHistoryPath(deviceId: string): string {
  if (!deviceId || /[/?#]/.test(deviceId) || deviceId.includes("..")) {
    throw new Error("Invalid device id.");
  }
  return `/v1/history/devices/${encodeURIComponent(deviceId)}/events`;
}

export function planRingReads(deviceIds: string[]): { method: "GET"; path: string }[] {
  const plan = [
    { method: "GET" as const, path: "/v1/devices" },
    ...deviceIds.map((id) => ({
      method: "GET" as const,
      path: `${ringEventHistoryPath(id)}?event_types=${encodeURIComponent("ding,motion")}`,
    })),
  ];
  for (const step of plan) assertMetadataPath(step.path);
  return plan;
}

export function classifyRingStatus(
  status: number,
): "ok" | "expired" | "forbidden" | "retry" | "error" {
  if (status >= 200 && status < 300) return "ok";
  if (status === 401) return "expired";
  if (status === 403) return "forbidden";
  if (status === 408 || status === 429 || status >= 500) return "retry";
  return "error";
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonRecord;
}

export function parseDevices(payload: unknown): RingDevice[] {
  const record = asRecord(payload);
  const data = record?.data;
  if (!Array.isArray(data)) return [];
  const devices: RingDevice[] = [];
  for (const item of data) {
    const row = asRecord(item);
    const id = row?.id;
    const attributes = asRecord(row?.attributes);
    const name = attributes?.name;
    if (typeof id !== "string" || typeof name !== "string") continue;
    devices.push({ id, name, role: inferRole(name) });
  }
  return devices;
}

export function parseHistoryEvents(
  payload: unknown,
  devices: RingDevice[],
  roles: Record<string, DeviceRole> = {},
): CareEvent[] {
  const record = asRecord(payload);
  const data = record?.data;
  if (!Array.isArray(data)) return [];
  const byId = new Map(devices.map((device) => [device.id, device]));
  const events: CareEvent[] = [];
  for (const item of data) {
    const row = asRecord(item);
    const attributes = asRecord(row?.attributes);
    const relationships = asRecord(row?.relationships);
    const source = asRecord(asRecord(relationships?.source)?.data);
    const eventType = attributes?.event_type;
    const id = row?.id;
    const start = attributes?.start;
    const end = attributes?.end;
    const deviceId = typeof source?.id === "string" ? source.id : "";
    if (typeof id !== "string" || typeof eventType !== "string") continue;
    if (eventType !== "motion" && eventType !== "ding") continue;
    if (typeof start !== "number") continue;
    const device = byId.get(deviceId);
    events.push({
      id,
      source: "ring",
      deviceId,
      deviceName: device?.name ?? "Ring device",
      role: roles[deviceId] ?? device?.role ?? "other",
      eventType,
      startMs: start,
      endMs: typeof end === "number" ? end : start,
    });
  }
  return events;
}

export function nextHistoryPath(payload: unknown): string | null {
  const record = asRecord(payload);
  const links = asRecord(record?.links);
  const next = links?.next;
  if (typeof next !== "string" || !next.startsWith("/v1/history/")) return null;
  assertMetadataPath(next);
  return next;
}
