import { describe, expect, it } from "vitest";
import {
  assertMetadataPath,
  classifyRingStatus,
  parseDevices,
  parseHistoryEvents,
  planRingReads,
} from "@/lib/ring";

describe("Ring metadata policy", () => {
  it("plans only device list and event history reads", () => {
    const plan = planRingReads(["ava1.ring.device.FRONT", "ava1.ring.device.KITCHEN"]);
    expect(plan.map((step) => step.path.split("?")[0])).toEqual([
      "/v1/devices",
      "/v1/history/devices/ava1.ring.device.FRONT/events",
      "/v1/history/devices/ava1.ring.device.KITCHEN/events",
    ]);
    expect(plan.some((step) => /media|streaming|download|snapshot/i.test(step.path))).toBe(false);
    for (const step of plan) assertMetadataPath(step.path);
  });

  it("refuses media and stream paths", () => {
    expect(() => assertMetadataPath("/v1/devices/abc/media/video/download")).toThrow(/media/i);
    expect(() => assertMetadataPath("/v1/devices/abc/media/streaming/whep/sessions")).toThrow(/media/i);
    expect(() => planRingReads(["bad/id"])).toThrow(/device id/i);
  });

  it("classifies token expiry and keeps 401 off the retry list", () => {
    expect(classifyRingStatus(401)).toBe("expired");
    expect(classifyRingStatus(403)).toBe("forbidden");
    expect(classifyRingStatus(429)).toBe("retry");
    expect(classifyRingStatus(200)).toBe("ok");
  });

  it("parses device names and history metadata, skipping live views", () => {
    const devices = parseDevices({
      data: [
        { type: "devices", id: "ava1.ring.device.DOOR", attributes: { name: "Front Door" } },
        { type: "devices", id: "ava1.ring.device.KIT", attributes: { name: "Kitchen" } },
      ],
    });
    expect(devices.map((device) => device.role)).toEqual(["door", "kitchen"]);
    const events = parseHistoryEvents(
      {
        data: [
          {
            id: "motion-1",
            attributes: { event_type: "motion", start: 1_700_000_000_000, end: 1_700_000_030_000 },
            relationships: { source: { data: { type: "devices", id: "ava1.ring.device.DOOR" } } },
          },
          {
            id: "live-1",
            attributes: { event_type: "on_demand", start: 1_700_000_100_000, end: 1_700_000_120_000 },
            relationships: { source: { data: { type: "devices", id: "ava1.ring.device.DOOR" } } },
          },
        ],
      },
      devices,
    );
    expect(events.map((event) => event.id)).toEqual(["motion-1"]);
    expect(events[0]?.deviceName).toBe("Front Door");
    expect(events[0]?.source).toBe("ring");
  });
});
