import type { CareEvent, DeviceRole, FeedInfo, Settings } from "@/lib/types";
import { buildSimulatedEvents, scenarioLabel } from "@/lib/simulate";
import { sameLocalDay } from "@/lib/time";

export function selectFeed(input: {
  settings: Pick<Settings, "sourceMode" | "scenario" | "ringStatus" | "ringDetail">;
  ringEvents: CareEvent[];
  deviceRoles: Record<string, DeviceRole>;
  asOf: Date;
}): { events: CareEvent[]; feed: FeedInfo } {
  const simulatedEvents = buildSimulatedEvents(input.settings.scenario, input.asOf).filter(
    (event) => event.startMs <= input.asOf.getTime(),
  );
  const simulated: FeedInfo = {
    source: "simulated",
    simulated: true,
    label: `Simulated feed — ${scenarioLabel(input.settings.scenario)}`,
    detail: "Practice data for the demo. No camera, no video, and no Ring account.",
  };

  const withRoles = input.ringEvents.map((event) => ({
    ...event,
    role: input.deviceRoles[event.deviceId] ?? event.role,
  }));
  const ringToday = withRoles.filter(
    (event) => sameLocalDay(event.startMs, input.asOf) && event.startMs <= input.asOf.getTime(),
  );

  if (input.settings.sourceMode === "simulated") {
    return { events: simulatedEvents, feed: simulated };
  }

  if (input.settings.ringStatus === "ok") {
    return {
      events: ringToday,
      feed: {
        source: "ring",
        simulated: false,
        label: "Ring metadata",
        detail:
          "Door and motion metadata from the Ring Partner API. Video, snapshots, and live streams are never requested.",
      },
    };
  }

  if (input.settings.ringStatus === "expired" && input.ringEvents.length > 0) {
    return {
      events: ringToday,
      feed: {
        source: "ring",
        simulated: false,
        label: "Ring metadata — last sync",
        detail: "The Playground token expired. Showing the last metadata sync. Generate a new token in Settings.",
      },
    };
  }

  if (input.settings.ringStatus === "expired" || input.settings.ringStatus === "error") {
    return {
      events: simulatedEvents,
      feed: {
        ...simulated,
        detail:
          input.settings.ringDetail ||
          "Ring didn't return metadata, so the simulated feed is on. Nothing was invented as if it came from a camera.",
      },
    };
  }

  return { events: simulatedEvents, feed: simulated };
}
