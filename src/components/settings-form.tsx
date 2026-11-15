"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useCare } from "@/components/care-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { DeviceRole, Scenario } from "@/lib/types";

const fieldClass = "h-12 text-base md:text-base";

export function SettingsForm() {
  const {
    settings,
    updateSettings,
    syncRing,
    syncing,
    ringDevices,
    deviceRoles,
    setDeviceRole,
    clearLocal,
  } = useCare();
  const [token, setToken] = useState(settings.ringToken);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setToken(settings.ringToken);
  }, [settings.ringToken]);

  return (
    <div className="grid gap-8">
      <div>
        <h2 className="text-3xl text-[#24352f]">Household and sources</h2>
        <p className="mt-2 max-w-2xl text-lg leading-relaxed text-[#3e5148]">
          Names stay in this browser. A Ring token is sent only to this site&apos;s sync route so it can call the Partner
          API, and it is not written to the server disk. The model key for the companion lives on the Companion page.
        </p>
      </div>

      <section className="grid gap-4 rounded-[1.4rem] bg-white p-5 ring-1 ring-[#e4d8c8]">
        <label className="grid gap-2">
          <span className="font-medium">Relative&apos;s name</span>
          <Input
            className={fieldClass}
            value={settings.relativeName}
            onChange={(event) => updateSettings({ relativeName: event.target.value })}
          />
        </label>
        <label className="grid gap-2">
          <span className="font-medium">Your name, if you want it in the hello</span>
          <Input
            className={fieldClass}
            value={settings.caregiverName}
            onChange={(event) => updateSettings({ caregiverName: event.target.value })}
            placeholder="Optional"
          />
        </label>
        <label className="flex items-center justify-between gap-4 rounded-2xl bg-[#f7f1e6] px-4 py-3">
          <span>
            <span className="block font-medium">Use the real clock</span>
            <span className="text-sm text-[#6d6256]">Off uses the demo time, so a morning check can be shown any hour.</span>
          </span>
          <input
            type="checkbox"
            className="size-5"
            checked={settings.clockMode === "live"}
            onChange={(event) => updateSettings({ clockMode: event.target.checked ? "live" : "demo" })}
          />
        </label>
        <label className="grid gap-2">
          <span className="font-medium">Demo clock</span>
          <Input
            className={fieldClass}
            type="time"
            value={settings.demoTime}
            onChange={(event) => updateSettings({ demoTime: event.target.value })}
          />
        </label>
        <label className="grid gap-2">
          <span className="font-medium">Simulated day</span>
          <select
            className="h-12 rounded-lg border border-input bg-transparent px-3 text-base"
            value={settings.scenario}
            onChange={(event) => updateSettings({ scenario: event.target.value as Scenario })}
          >
            <option value="quiet-morning">Quiet morning — drafts a check-in</option>
            <option value="steady">Steady day — routine matches</option>
            <option value="restless-evening">Movement after settle time</option>
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-12 bg-white px-4 text-base"
            onClick={() => updateSettings({ sourceMode: "simulated" })}
          >
            Use the simulated feed
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-12 bg-white px-4 text-base"
            onClick={() => updateSettings({ sourceMode: "ring" })}
          >
            Use Ring metadata
          </Button>
        </div>
        <p className="text-base text-[#3e5148]">
          Current source: {settings.sourceMode === "simulated" ? "simulated" : "Ring"}. {settings.ringDetail}
        </p>
      </section>

      <section className="grid gap-4 rounded-[1.4rem] bg-white p-5 ring-1 ring-[#e4d8c8]">
        <h3 className="text-2xl text-[#24352f]">Ring Playground token</h3>
        <p className="text-base leading-relaxed text-[#3e5148]">
          Paste a short-lived token from the Ring Developer Playground. The sync reads devices and today&apos;s door and
          motion history. It never calls a media, snapshot, or livestream URL. Playground tokens often last about 30
          minutes.
        </p>
        <Textarea
          className="min-h-28 text-base md:text-base"
          value={token}
          autoComplete="off"
          spellCheck={false}
          placeholder="Paste the access token"
          onChange={(event) => setToken(event.target.value)}
          aria-label="Ring Playground token"
        />
        <Button
          type="button"
          className="h-12 w-fit px-5 text-base"
          disabled={syncing}
          onClick={() => {
            setNotice("");
            void syncRing(token).then(() => setNotice("Sync finished. The banner on Today says which feed is showing."));
          }}
        >
          {syncing ? "Syncing metadata…" : "Sync door and motion metadata"}
        </Button>
        {notice ? <p className="text-base text-[#234237]">{notice}</p> : null}
        {ringDevices.length > 0 ? (
          <ul className="grid gap-3">
            {ringDevices.map((device) => (
              <li key={device.id} className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-base">{device.name}</span>
                <select
                  className="h-12 rounded-lg border border-input bg-transparent px-3 text-base"
                  value={deviceRoles[device.id] ?? device.role}
                  aria-label={`Role for ${device.name}`}
                  onChange={(event) => setDeviceRole(device.id, event.target.value as DeviceRole)}
                >
                  <option value="door">Door</option>
                  <option value="kitchen">Kitchen</option>
                  <option value="other">Other movement</option>
                </select>
              </li>
            ))}
          </ul>
        ) : null}
        <Link href="/companion" className="text-base text-[#2f5d4a] underline">
          Set a model key on the Companion page
        </Link>
      </section>

      <section className="rounded-[1.4rem] bg-[#f6e4d8] p-5 text-[#6a3b28]">
        <h3 className="text-xl">Clear this browser</h3>
        <p className="mt-2 text-base leading-relaxed">
          Removes the saved routine, drafts, token, and model key from this browser.
        </p>
        <Button type="button" variant="outline" className="mt-4 h-12 bg-white px-4 text-base" onClick={clearLocal}>
          Clear saved data
        </Button>
      </section>
    </div>
  );
}
