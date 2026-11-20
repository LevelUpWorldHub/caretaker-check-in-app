"use client";

import { useState } from "react";
import { useCare } from "@/components/care-provider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { CheckIn } from "@/lib/types";

function Card({ item }: { item: CheckIn }) {
  const { updateCheckIn } = useCare();
  const [message, setMessage] = useState(item.message);
  const [copyNote, setCopyNote] = useState("");
  const [error, setError] = useState("");
  const apply = (status: CheckIn["status"]) => {
    const result = updateCheckIn(item.id, status, message);
    setError(result.ok ? "" : (result.error ?? "That wording can't be saved."));
    return result.ok;
  };
  const editable = item.status === "draft" || item.status === "approved";

  return (
    <article className="rounded-[1.4rem] bg-white px-5 py-5 ring-1 ring-[#e4d8c8]" data-testid={`checkin-${item.status}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm tracking-[0.14em] text-[#6d6256] uppercase">
          {item.autonomous ? "Drafted by the watch" : "Drafted with the companion"} · {item.status}
        </p>
        <p className="text-sm text-[#6d6256]">{item.sent ? "Sent" : "Not sent"}</p>
      </div>
      <p className="mt-2 text-base text-[#3e5148]">{item.reason}</p>
      <Textarea
        className="mt-4 min-h-32 text-lg leading-relaxed md:text-lg"
        value={message}
        disabled={!editable}
        onChange={(event) => {
          setMessage(event.target.value);
          if (error) setError("");
        }}
        aria-label="Check-in wording"
        aria-invalid={error ? true : undefined}
      />
      <div className="mt-4 flex flex-wrap gap-2">
        {item.status === "draft" ? (
          <Button
            type="button"
            className="h-12 px-4 text-base"
            data-testid="approve-wording"
            onClick={() => apply("approved")}
          >
            Approve wording
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          className="h-12 bg-white px-4 text-base"
          onClick={async () => {
            if (!apply("copied")) return;
            try {
              await navigator.clipboard.writeText(message);
              setCopyNote("Copied. Send it from your own phone or email if you want to.");
            } catch {
              setCopyNote("Clipboard wasn't available. Select the wording and copy it yourself.");
            }
          }}
        >
          Copy
        </Button>
        {item.status !== "dismissed" ? (
          <Button
            type="button"
            variant="ghost"
            className="h-12 px-4 text-base"
            onClick={() => apply("dismissed")}
          >
            Dismiss
          </Button>
        ) : null}
      </div>
      {error ? (
        <p className="mt-3 rounded-2xl bg-[#f6e4d8] px-4 py-3 text-base text-[#6a3b28]" role="alert" data-testid="checkin-inline-error">
          {error}
        </p>
      ) : null}
      {item.status === "approved" ? (
        <p className="mt-3 text-base text-[#234237]">
          Approved to send yourself. This app will not send it.
        </p>
      ) : null}
      {copyNote ? <p className="mt-2 text-base text-[#3e5148]">{copyNote}</p> : null}
    </article>
  );
}

export function CheckInList() {
  const { checkIns, checkInError } = useCare();
  const ordered = [...checkIns].sort((a, b) => (a.status === "draft" ? -1 : 1) - (b.status === "draft" ? -1 : 1));

  return (
    <div className="grid gap-6">
      <div>
        <h2 className="text-3xl text-[#24352f]">Check-ins you can approve</h2>
        <p className="mt-2 max-w-2xl text-lg leading-relaxed text-[#3e5148]">
          Approving saves the wording here. Copy it if you want to send it yourself. Nothing leaves this browser on its own.
        </p>
      </div>
      {checkInError ? (
        <p className="rounded-2xl bg-[#f6e4d8] px-4 py-3 text-base text-[#6a3b28]" role="alert">
          {checkInError}
        </p>
      ) : null}
      {ordered.length === 0 ? (
        <p className="rounded-2xl bg-white px-5 py-6 text-lg leading-relaxed text-[#3e5148] ring-1 ring-[#e4d8c8]">
          No check-in is waiting. The watch drafts one when the morning passes with no door or motion events. You can also ask the companion to draft one.
        </p>
      ) : (
        <div className="grid gap-4">
          {ordered.map((item) => (
            <Card key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
