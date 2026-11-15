"use client";

import { useCare } from "@/components/care-provider";
import { formatHm } from "@/lib/time";

export function EventList() {
  const { ready, derived } = useCare();
  if (!ready || !derived) return <p className="text-xl">Gathering events…</p>;

  return (
    <div className="grid gap-6">
      <div>
        <h2 className="text-3xl text-[#24352f]">Door and motion metadata</h2>
        <p className="mt-2 max-w-2xl text-lg leading-relaxed text-[#3e5148]">
          {derived.feed.label}. {derived.feed.detail} Times are compared with the routine. The pictures stay on the camera.
        </p>
      </div>
      {derived.events.length === 0 ? (
        <p className="rounded-2xl bg-white px-5 py-6 text-lg leading-relaxed text-[#3e5148] ring-1 ring-[#e4d8c8]">
          No door or motion events in this view yet. A new Ring link often has an empty history until something happens
          after consent. The simulated feed in Settings can show a full day without a token.
        </p>
      ) : (
        <ol className="grid gap-3">
          {derived.events.map((event) => (
            <li key={event.id} className="grid gap-1 rounded-2xl bg-white px-5 py-4 ring-1 ring-[#e4d8c8] sm:grid-cols-[7rem_1fr]">
              <time className="text-lg font-medium text-[#24352f]" dateTime={new Date(event.startMs).toISOString()}>
                {formatHm(event.startMs)}
              </time>
              <div>
                <p className="text-lg text-[#24352f]">
                  {event.deviceName}
                  <span className="text-[#6d6256]"> · {event.eventType}</span>
                  {event.subtype ? <span className="text-[#6d6256]"> · {event.subtype}</span> : null}
                </p>
                <p className="text-sm text-[#6d6256]">
                  Counts as {event.role === "door" ? "the door" : event.role === "kitchen" ? "a meal" : "other movement"} · {event.source === "simulated" ? "simulated" : "Ring metadata"} · {event.id}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
