"use client";

import Link from "next/link";
import { useCare } from "@/components/care-provider";
import { Citations, WindowList } from "@/components/windows";
import { formatDay, formatHm } from "@/lib/time";

export function TodayView() {
  const { ready, settings, derived, note, noteStatus, checkIns, autonomy } = useCare();
  if (!ready || !derived || !note) {
    return (
      <p className="text-xl text-[#3e5148]" aria-live="polite">
        Opening today&apos;s note…
      </p>
    );
  }
  const draft = checkIns.find((item) => item.status === "draft");
  const relative = settings.relativeName.trim() || "your relative";

  return (
    <div className="grid gap-8">
      <section
        className={
          derived.feed.simulated
            ? "rounded-2xl bg-[#f3ead2] px-5 py-4 text-[#5c4a28] ring-1 ring-[#e4d3a8]"
            : "rounded-2xl bg-[#e5f0ea] px-5 py-4 text-[#234237] ring-1 ring-[#c9ddd2]"
        }
        data-testid="feed-banner"
      >
        <p className="text-sm tracking-[0.14em] uppercase">{derived.feed.simulated ? "Simulated" : "Ring"}</p>
        <p className="mt-1 text-lg">{derived.feed.label}</p>
        <p className="mt-1 text-base leading-relaxed">{derived.feed.detail}</p>
      </section>

      <article
        data-testid="today-note"
        className="rounded-[1.6rem] border-l-4 border-[#2f5d4a] bg-[#fffaf3] px-6 py-8 shadow-[0_12px_40px_rgba(70,50,20,0.05)] ring-1 ring-[#e4d8c8] sm:px-10"
        aria-live="polite"
      >
        <p className="text-sm tracking-[0.16em] text-[#6d6256] uppercase">Daily note</p>
        <h2 className="font-note mt-2 text-4xl leading-tight text-[#24352f]">
          {formatDay(derived.asOf)}
        </h2>
        <p className="mt-2 text-base text-[#6d6256]">
          For {settings.caregiverName.trim() || "you"}, about {relative}. As of{" "}
          {formatHm(derived.asOf.getTime())}
          {settings.clockMode === "demo" ? " on the demo clock" : ""}. {noteStatus === "loading" ? "Refreshing the wording." : note.detail}
        </p>
        <ol className="mt-6 grid gap-6">
          {note.lines.map((line, index) => (
            <li key={`${line.text}-${index}`} className="font-note text-[1.45rem] leading-relaxed text-[#24352f]">
              {line.text}
              <Citations ids={line.eventIds} events={derived.events} />
            </li>
          ))}
        </ol>
      </article>

      {draft ? (
        <section className="rounded-[1.6rem] bg-white px-6 py-6 ring-1 ring-[#e4d8c8]" data-testid="check-in-draft">
          <p className="text-sm tracking-[0.14em] text-[#6a3b28] uppercase">Waiting for you</p>
          <h2 className="mt-2 text-2xl text-[#24352f]">A check-in was drafted. Nothing was sent.</h2>
          <p className="mt-4 text-lg leading-relaxed text-[#3e5148]">{draft.message}</p>
          <Link
            href="/check-ins"
            className="mt-5 inline-flex h-12 items-center rounded-full bg-primary px-5 text-base text-primary-foreground"
          >
            Review the wording
          </Link>
        </section>
      ) : null}

      <section>
        <h2 className="text-2xl text-[#24352f]">How the day compares</h2>
        <div className="mt-4">
          <WindowList windows={derived.comparison.windows} />
        </div>
      </section>

      <section>
        <h2 className="text-2xl text-[#24352f]">What the watch did</h2>
        <ul className="mt-4 grid gap-3">
          {autonomy.slice(0, 3).map((entry) => (
            <li key={entry.id} className="rounded-2xl bg-white/80 px-4 py-3 text-base leading-relaxed text-[#3e5148] ring-1 ring-[#e4d8c8]">
              {entry.text}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
