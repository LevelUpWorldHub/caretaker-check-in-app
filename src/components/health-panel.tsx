"use client";

import { useCare } from "@/components/care-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TONE = {
  ok: "bg-[#e5f0ea] text-[#234237]",
  degraded: "bg-[#f3ead2] text-[#5c4a28]",
  down: "bg-[#f6e4d8] text-[#6a3b28]",
  standby: "bg-[#f3efe8] text-[#6d6256]",
};

export function HealthPanel() {
  const { health, refreshHealth } = useCare();
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl text-[#24352f]">What is holding</h2>
          <p className="mt-2 max-w-2xl text-lg leading-relaxed text-[#3e5148]">
            Requests time out, retry when the failure is temporary, and fall back to a template or the simulated feed.
            A rejected token stays a rejected token. The page says so instead of pretending the camera answered.
          </p>
        </div>
        <Button type="button" className="h-12 px-4 text-base" onClick={() => void refreshHealth()}>
          Run checks
        </Button>
      </div>
      <ul className="grid gap-3" data-testid="health-panel">
        {health.map((item) => (
          <li key={item.id} className="rounded-2xl bg-white px-5 py-4 ring-1 ring-[#e4d8c8]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg text-[#24352f]">{item.label}</h3>
              <span className={cn("rounded-full px-3 py-1 text-sm", TONE[item.state])}>{item.state}</span>
            </div>
            <p className="mt-2 text-base leading-relaxed text-[#3e5148]">{item.detail}</p>
            {typeof item.attempts === "number" ? (
              <p className="mt-1 text-sm text-[#6d6256]">Last Ring sync attempts: {item.attempts}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
