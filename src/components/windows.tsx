import type { CareEvent, WindowResult } from "@/lib/types";
import { formatHm } from "@/lib/time";
import { cn } from "@/lib/utils";

const TONE: Record<WindowResult["status"], string> = {
  met: "bg-[#e5f0ea] text-[#234237]",
  missed: "bg-[#f6e4d8] text-[#6a3b28]",
  in_progress: "bg-[#f3ead2] text-[#5c4a28]",
  upcoming: "bg-[#f3efe8] text-[#6d6256]",
};

const STATUS_LABEL: Record<WindowResult["status"], string> = {
  met: "Matched",
  missed: "Quiet",
  in_progress: "Open",
  upcoming: "Later",
};

export function WindowList({ windows }: { windows: WindowResult[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {windows.map((window) => (
        <li key={window.code} className="rounded-2xl bg-white/80 p-4 ring-1 ring-[#e4d8c8]">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-medium text-[#24352f]">{window.label}</h3>
            <span className={cn("rounded-full px-3 py-1 text-sm", TONE[window.status])}>
              {STATUS_LABEL[window.status]}
            </span>
          </div>
          <p className="mt-2 text-base leading-relaxed text-[#3e5148]">{window.detail}</p>
        </li>
      ))}
    </ul>
  );
}

export function Citations({ ids, events }: { ids: string[]; events: CareEvent[] }) {
  if (!ids.length) {
    return <p className="mt-2 font-sans text-sm text-[#6d6256]">No single event is cited for this line.</p>;
  }
  return (
    <ul className="mt-3 flex flex-wrap gap-2">
      {ids.map((id) => {
        const event = events.find((item) => item.id === id);
        return (
          <li key={id} className="rounded-full bg-[#efe6d6] px-3 py-1 font-sans text-sm text-[#3e5148]">
            {event
              ? `${event.deviceName} · ${formatHm(event.startMs)} · ${event.eventType}${event.subtype ? ` · ${event.subtype}` : ""}`
              : id}
          </li>
        );
      })}
    </ul>
  );
}
