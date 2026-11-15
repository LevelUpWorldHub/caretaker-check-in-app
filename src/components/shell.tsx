"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useCare } from "@/components/care-provider";
import { cn } from "@/lib/utils";

const LINKS = [
  ["/", "Today"],
  ["/routine", "Routine"],
  ["/events", "Events"],
  ["/check-ins", "Check-ins"],
  ["/companion", "Companion"],
  ["/health", "Health"],
  ["/settings", "Settings"],
];

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { checkIns } = useCare();
  const waiting = checkIns.filter((item) => item.status === "draft").length;

  return (
    <div className="min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to the note
      </a>
      <header className="border-b border-border/80 bg-[#f7f1e6]">
        <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm tracking-[0.16em] text-[#6d6256] uppercase">Level Up Inc</p>
              <h1 className="font-note mt-1 text-4xl text-[#24352f] sm:text-5xl">Caretaker Check-in</h1>
              <p className="mt-2 max-w-xl text-lg leading-relaxed text-[#3e5148]">
                A calm daily note for someone looking after a relative who lives alone.
              </p>
            </div>
            <p className="max-w-xs text-sm leading-relaxed text-[#6d6256]">
              The watch drafts a hello. You decide whether to send it.
            </p>
          </div>
          <nav aria-label="Sections" className="flex gap-2 overflow-x-auto pb-1">
            {LINKS.map(([href, label]) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "shrink-0 rounded-full px-4 py-2 text-base",
                    active ? "bg-primary text-primary-foreground" : "bg-white/70 text-[#24352f] ring-1 ring-[#e4d8c8]",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  {label}
                  {href === "/check-ins" && waiting > 0 ? ` (${waiting})` : ""}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {children}
      </main>
      <footer className="mx-auto max-w-5xl px-4 pb-10 text-sm leading-relaxed text-[#6d6256] sm:px-6">
        Mark Yukhimets · Level Up Inc · MIT license · Built for the Cognizant Open Agentic Web Challenge.
        Event metadata only. No video.
      </footer>
    </div>
  );
}
