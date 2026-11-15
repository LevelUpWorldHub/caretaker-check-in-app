"use client";

import { useEffect, useState } from "react";
import { useCare } from "@/components/care-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Baseline } from "@/lib/types";

const FIELDS: { key: keyof Baseline; label: string; hint: string }[] = [
  { key: "wakeStart", label: "Wake window starts", hint: "When movement usually begins." },
  { key: "wakeEnd", label: "Wake window ends", hint: "Movement inside this span counts as waking on time." },
  { key: "morningCheckBy", label: "Morning check", hint: "If nothing has happened by this time, a check-in is drafted." },
  { key: "doorStart", label: "Door window starts", hint: "Doorbell or front-door motion." },
  { key: "doorEnd", label: "Door window ends", hint: "After this, a quiet door is part of the note." },
  { key: "lunchStart", label: "Lunch starts", hint: "Kitchen motion counts toward a meal." },
  { key: "lunchEnd", label: "Lunch ends", hint: "The kitchen window closes." },
  { key: "dinnerStart", label: "Dinner starts", hint: "Kitchen motion again." },
  { key: "dinnerEnd", label: "Dinner ends", hint: "The dinner window closes." },
  { key: "eveningStart", label: "Evening starts", hint: "Any door or motion counts." },
  { key: "eveningSettleBy", label: "Settle time", hint: "Movement after this is mentioned, not treated as an emergency." },
];

const fieldClass = "h-12 text-base md:text-base";

export function RoutineForm() {
  const { baseline, saveBaseline } = useCare();
  const [draft, setDraft] = useState<Baseline>(baseline);
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(baseline);
  }, [baseline]);

  return (
    <form
      className="grid gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        const nextErrors = saveBaseline(draft);
        setErrors(nextErrors);
        setSaved(nextErrors.length === 0);
      }}
    >
      <div>
        <h2 className="text-3xl text-[#24352f]">The usual day</h2>
        <p className="mt-2 max-w-2xl text-lg leading-relaxed text-[#3e5148]">
          These times are the baseline. The note compares door and motion metadata with them. Change a time and the
          watch uses it on the next pass.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((field) => (
          <label key={field.key} className="grid gap-2 rounded-2xl bg-white/80 p-4 ring-1 ring-[#e4d8c8]">
            <span className="text-base font-medium text-[#24352f]">{field.label}</span>
            <Input
              className={fieldClass}
              type="time"
              value={draft[field.key]}
              onChange={(event) => {
                setSaved(false);
                setDraft((current) => ({ ...current, [field.key]: event.target.value }));
              }}
            />
            <span className="text-sm leading-relaxed text-[#6d6256]">{field.hint}</span>
          </label>
        ))}
      </div>
      {errors.length > 0 ? (
        <ul className="rounded-2xl bg-[#f6e4d8] px-4 py-3 text-base text-[#6a3b28]">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}
      {saved ? <p className="text-base text-[#234237]">Saved. Today&apos;s note will refresh against these times.</p> : null}
      <Button type="submit" className="h-12 w-fit px-5 text-base">
        Save the routine
      </Button>
    </form>
  );
}
