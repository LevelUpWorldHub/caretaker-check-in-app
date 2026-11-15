"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { autonomyText } from "@/lib/autonomy";
import { baselineErrors } from "@/lib/baseline";
import { draftCheckInMessage, manualCheckIn, reconcileCheckIns, withCheckInStatus } from "@/lib/checkin";
import { defaultBaseline, defaultSettings } from "@/lib/defaults";
import { selectFeed } from "@/lib/feed";
import { fallbackNote } from "@/lib/fallback";
import { notePayload } from "@/lib/note";
import { compareBaseline } from "@/lib/baseline";
import { isHm, resolveAsOf } from "@/lib/time";
import { verifyLines } from "@/lib/verifier";
import type {
  AutonomyEntry,
  Baseline,
  CareEvent,
  CheckIn,
  CheckInStatus,
  Comparison,
  DailyNote,
  DeviceRole,
  FeedInfo,
  HealthItem,
  RingDevice,
  Settings,
} from "@/lib/types";

const STORAGE_KEY = "caretaker-checkin-v1";

type ServerHealth = {
  grokConfigured: boolean;
  model: string;
  ring: { state: "ok" | "degraded" | "down"; detail: string };
};

type Derived = {
  events: CareEvent[];
  feed: FeedInfo;
  comparison: Comparison;
  asOf: Date;
};

type Persisted = {
  settings?: Partial<Settings>;
  baseline?: Partial<Baseline>;
  ringEvents?: CareEvent[];
  ringDevices?: RingDevice[];
  checkIns?: CheckIn[];
  autonomy?: AutonomyEntry[];
  deviceRoles?: Record<string, DeviceRole>;
};

type CareContextValue = {
  ready: boolean;
  settings: Settings;
  baseline: Baseline;
  derived: Derived | null;
  note: DailyNote | null;
  noteStatus: "loading" | "ready";
  checkIns: CheckIn[];
  autonomy: AutonomyEntry[];
  ringDevices: RingDevice[];
  deviceRoles: Record<string, DeviceRole>;
  health: HealthItem[];
  syncing: boolean;
  checkInError: string;
  updateSettings: (patch: Partial<Settings>) => void;
  saveBaseline: (next: Baseline) => string[];
  setDeviceRole: (deviceId: string, role: DeviceRole) => void;
  syncRing: (token: string) => Promise<void>;
  updateCheckIn: (id: string, status: CheckInStatus, message?: string) => void;
  addManualCheckIn: (message: string, reason: string) => { ok: boolean; error?: string; id?: string };
  refreshHealth: () => Promise<void>;
  clearLocal: () => void;
  readCareState: () => Record<string, unknown>;
  applyBaselinePatch: (patch: Record<string, unknown>) => Record<string, unknown>;
};

const CareContext = createContext<CareContextValue | null>(null);

export function useCare(): CareContextValue {
  const value = useContext(CareContext);
  if (!value) throw new Error("useCare must be used inside CareProvider");
  return value;
}

function checkedAt(): string {
  return new Date().toISOString();
}

export function CareProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [baseline, setBaseline] = useState<Baseline>(defaultBaseline);
  const [ringEvents, setRingEvents] = useState<CareEvent[]>([]);
  const [ringDevices, setRingDevices] = useState<RingDevice[]>([]);
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [autonomy, setAutonomy] = useState<AutonomyEntry[]>([]);
  const [deviceRoles, setDeviceRoles] = useState<Record<string, DeviceRole>>({});
  const [derived, setDerived] = useState<Derived | null>(null);
  const [note, setNote] = useState<DailyNote | null>(null);
  const [noteStatus, setNoteStatus] = useState<"loading" | "ready">("loading");
  const [hydrated, setHydrated] = useState(false);
  const [serverHealth, setServerHealth] = useState<ServerHealth | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [ringAttempts, setRingAttempts] = useState<number | undefined>(undefined);
  const [checkInError, setCheckInError] = useState("");

  const settingsRef = useRef(settings);
  const baselineRef = useRef(baseline);
  const checkInsRef = useRef(checkIns);
  const autonomyRef = useRef(autonomy);
  const derivedRef = useRef(derived);
  const noteRef = useRef(note);
  settingsRef.current = settings;
  baselineRef.current = baseline;
  checkInsRef.current = checkIns;
  autonomyRef.current = autonomy;
  derivedRef.current = derived;
  noteRef.current = note;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Persisted;
        if (parsed.settings) setSettings({ ...defaultSettings, ...parsed.settings });
        if (parsed.baseline) setBaseline({ ...defaultBaseline, ...parsed.baseline });
        if (Array.isArray(parsed.ringEvents)) setRingEvents(parsed.ringEvents);
        if (Array.isArray(parsed.ringDevices)) setRingDevices(parsed.ringDevices);
        if (Array.isArray(parsed.checkIns)) setCheckIns(parsed.checkIns);
        if (Array.isArray(parsed.autonomy)) setAutonomy(parsed.autonomy);
        if (parsed.deviceRoles) setDeviceRoles(parsed.deviceRoles);
      }
    } catch {
      /* keep the defaults */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const payload: Persisted = {
      settings,
      baseline,
      ringEvents,
      ringDevices,
      checkIns,
      autonomy,
      deviceRoles,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [hydrated, settings, baseline, ringEvents, ringDevices, checkIns, autonomy, deviceRoles]);

  const signature = useMemo(
    () =>
      JSON.stringify({
        baseline,
        relativeName: settings.relativeName,
        caregiverName: settings.caregiverName,
        sourceMode: settings.sourceMode,
        scenario: settings.scenario,
        clockMode: settings.clockMode,
        demoTime: settings.demoTime,
        ringStatus: settings.ringStatus,
        ringSyncedAt: settings.ringSyncedAt,
        ringDetail: settings.ringDetail,
        events: ringEvents.map((event) => `${event.id}:${event.role}:${event.startMs}`),
        deviceRoles,
      }),
    [baseline, settings, ringEvents, deviceRoles],
  );

  useEffect(() => {
    if (!hydrated) return;
    let cancel = false;
    const currentSettings = settingsRef.current;
    const currentBaseline = baselineRef.current;
    const asOf = resolveAsOf(
      currentSettings.clockMode,
      isHm(currentSettings.demoTime) ? currentSettings.demoTime : "10:45",
    );
    const { events, feed } = selectFeed({
      settings: currentSettings,
      ringEvents,
      deviceRoles,
      asOf,
    });
    const comparison = compareBaseline({ baseline: currentBaseline, events, asOf });
    const nextCheckIns = reconcileCheckIns({
      existing: checkInsRef.current,
      comparison,
      baseline: currentBaseline,
      events,
      relativeName: currentSettings.relativeName,
      caregiverName: currentSettings.caregiverName,
    });
    const entry: AutonomyEntry = {
      id: `${comparison.dayKey}:watch`,
      dayKey: comparison.dayKey,
      at: new Date().toISOString(),
      text: autonomyText(comparison),
    };
    const nextAutonomy = [
      entry,
      ...autonomyRef.current.filter((item) => item.dayKey !== comparison.dayKey),
    ].slice(0, 12);
    setDerived({ events, feed, comparison, asOf });
    setCheckIns(nextCheckIns);
    setAutonomy(nextAutonomy);
    setNoteStatus("loading");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    void (async () => {
      const payload = notePayload({
        relativeName: currentSettings.relativeName,
        comparison,
        events,
      });
      try {
        const response = await fetch("/api/note", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("note");
        const data = (await response.json()) as { note?: DailyNote };
        let next = data.note;
        if (!next?.lines?.length) throw new Error("empty");
        const verdict = verifyLines(next.lines);
        if (!verdict.ok) {
          next = fallbackNote({
            comparison,
            events,
            heldBack: true,
            reasons: verdict.reasons,
            detail: `A note was held back (${verdict.reasons.join(", ")}). The template is shown instead.`,
          });
        }
        if (!cancel) {
          setNote(next);
          setNoteStatus("ready");
        }
      } catch {
        if (!cancel) {
          setNote(
            fallbackNote({
              comparison,
              events,
              detail: "The note request didn't finish. This template still cites the same routine comparison.",
            }),
          );
          setNoteStatus("ready");
        }
      } finally {
        clearTimeout(timer);
      }
    })();

    return () => {
      cancel = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [hydrated, signature, ringEvents, deviceRoles]);

  const refreshHealth = async () => {
    try {
      const response = await fetch("/api/health", { cache: "no-store" });
      if (!response.ok) throw new Error("health");
      setServerHealth((await response.json()) as ServerHealth);
    } catch {
      setServerHealth({
        grokConfigured: false,
        model: "grok-4.7",
        ring: { state: "down", detail: "The health check didn't finish. The page itself is still up." },
      });
    }
  };

  useEffect(() => {
    if (hydrated) void refreshHealth();
  }, [hydrated]);

  const readCareState = () => {
    const current = derivedRef.current;
    const currentNote = noteRef.current;
    const currentSettings = settingsRef.current;
    if (!current || !currentNote) return { ready: false };
    let suggestedCheckIn: string | null = null;
    try {
      suggestedCheckIn =
        draftCheckInMessage({
          caregiverName: currentSettings.caregiverName,
          relativeName: currentSettings.relativeName,
          baseline: baselineRef.current,
          comparison: current.comparison,
          events: current.events,
        })?.message ?? null;
    } catch {
      suggestedCheckIn = null;
    }
    return {
      ready: true,
      relativeName: currentSettings.relativeName,
      asOfLabel: current.asOf.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
      feed: { label: current.feed.label, simulated: current.feed.simulated },
      windows: current.comparison.windows,
      note: {
        source: currentNote.source,
        detail: currentNote.detail,
        lines: currentNote.lines,
      },
      pendingCheckIns: checkInsRef.current
        .filter((item) => item.status === "draft")
        .map((item) => ({ id: item.id, reason: item.reason, message: item.message, sent: false })),
      suggestedCheckIn,
      morningMissed: current.comparison.windows.some(
        (window) => window.code === "morning_check" && window.status === "missed",
      ),
      events: current.events.map((event) => ({
        id: event.id,
        deviceName: event.deviceName,
        role: event.role,
        eventType: event.eventType,
        time: event.startMs,
      })),
    };
  };

  const applyBaselinePatch = (patch: Record<string, unknown>) => {
    const next: Baseline = { ...baselineRef.current };
    for (const key of Object.keys(next) as (keyof Baseline)[]) {
      const value = patch[key];
      if (typeof value === "string") next[key] = value;
    }
    const errors = baselineErrors(next);
    if (errors.length) return { saved: false, errors };
    setBaseline(next);
    return { saved: true, baseline: next };
  };

  const addManualCheckIn = (message: string, reason: string) => {
    const dayKey = derivedRef.current?.comparison.dayKey ?? "today";
    try {
      const created = manualCheckIn({
        message,
        reason,
        eventIds: derivedRef.current?.comparison.windows.find((window) => window.checkIn)?.eventIds ?? [],
        dayKey,
        id: `manual-${Date.now()}`,
      });
      setCheckIns((items) => [created, ...items]);
      setCheckInError("");
      return { ok: true, id: created.id };
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "That draft couldn't be saved.";
      setCheckInError(messageText);
      return { ok: false, error: messageText };
    }
  };

  const health = useMemo<HealthItem[]>(() => {
    const now = checkedAt();
    const feed = derived?.feed;
    const noteItem: HealthItem = !note
      ? { id: "note", label: "Daily note", state: "standby", detail: "Writing the note.", checkedAt: now }
      : note.verifier.heldBack
        ? {
            id: "note",
            label: "Daily note",
            state: "degraded",
            detail: note.detail,
            checkedAt: note.generatedAt,
          }
        : note.source === "template"
          ? {
              id: "note",
              label: "Daily note",
              state: "degraded",
              detail: note.detail,
              checkedAt: note.generatedAt,
            }
          : {
              id: "note",
              label: "Daily note",
              state: "ok",
              detail: note.detail,
              checkedAt: note.generatedAt,
            };
    return [
      {
        id: "store",
        label: "Browser store",
        state: hydrated ? "ok" : "standby",
        detail: hydrated
          ? "Routine, drafts, and the Ring token stay in this browser."
          : "Opening saved settings.",
        checkedAt: now,
      },
      {
        id: "feed",
        label: "Event feed",
        state: feed?.source === "ring" ? "ok" : "standby",
        detail: feed ? `${feed.label}. ${feed.detail}` : "Choosing a feed.",
        checkedAt: now,
      },
      noteItem,
      {
        id: "verifier",
        label: "Note verifier",
        state: note?.verifier.heldBack ? "degraded" : "ok",
        detail: note?.verifier.heldBack
          ? `Held a draft back: ${note.verifier.reasons.join(", ")}.`
          : "Medical diagnoses and emergency claims are blocked before a note is shown.",
        checkedAt: now,
      },
      {
        id: "checkins",
        label: "Check-in approval",
        state: "ok",
        detail: "Drafts wait here. Approving wording does not send anything.",
        checkedAt: now,
      },
      {
        id: "agents",
        label: "Agent runtime",
        state: "ok",
        detail: "The published network runs in this browser. Writes wait for a confirmation dialog.",
        checkedAt: now,
      },
      {
        id: "ring",
        label: "Ring API",
        state:
          settings.ringStatus === "ok"
            ? "ok"
            : settings.ringStatus === "expired" || settings.ringStatus === "error"
              ? "degraded"
              : serverHealth?.ring.state === "ok"
                ? "standby"
                : serverHealth?.ring.state === "down"
                  ? "down"
                  : "standby",
        detail:
          settings.ringStatus === "idle"
            ? serverHealth?.ring.detail ?? "No token yet. The simulated feed does not need Ring."
            : settings.ringDetail,
        checkedAt: now,
        attempts: ringAttempts,
      },
      {
        id: "grok",
        label: "Grok",
        state: serverHealth?.grokConfigured ? "ok" : "standby",
        detail: serverHealth?.grokConfigured
          ? `${serverHealth.model} is configured on the server. Web search and X search are off.`
          : "No server key. Notes use the template, and the companion can run in grounded mode or with your own key.",
        checkedAt: now,
      },
    ];
  }, [hydrated, derived, note, settings.ringStatus, settings.ringDetail, serverHealth, ringAttempts]);

  const value: CareContextValue = {
    ready: hydrated && Boolean(derived) && Boolean(note),
    settings,
    baseline,
    derived,
    note,
    noteStatus,
    checkIns,
    autonomy,
    ringDevices,
    deviceRoles,
    health,
    syncing,
    checkInError,
    updateSettings: (patch) => setSettings((current) => ({ ...current, ...patch })),
    saveBaseline: (next) => {
      const errors = baselineErrors(next);
      if (errors.length) return errors;
      setBaseline(next);
      return [];
    },
    setDeviceRole: (deviceId, role) => setDeviceRoles((current) => ({ ...current, [deviceId]: role })),
    syncRing: async (token) => {
      setSyncing(true);
      try {
        const response = await fetch("/api/ring/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            timezoneOffsetMinutes: new Date().getTimezoneOffset(),
            deviceRoles,
          }),
        });
        const data = (await response.json()) as {
          ok?: boolean;
          code?: string;
          message?: string;
          attempts?: number;
          events?: CareEvent[];
          devices?: RingDevice[];
        };
        setRingAttempts(data.attempts);
        if (data.code === "expired") {
          setSettings((current) => ({
            ...current,
            ringToken: token,
            sourceMode: "ring",
            ringStatus: "expired",
            ringDetail: data.message ?? "The token expired.",
          }));
          return;
        }
        if (!response.ok || !data.ok) {
          setSettings((current) => ({
            ...current,
            ringToken: token,
            sourceMode: "ring",
            ringStatus: "error",
            ringDetail: data.message ?? "Ring didn't answer.",
          }));
          return;
        }
        setRingEvents(data.events ?? []);
        setRingDevices(data.devices ?? []);
        setSettings((current) => ({
          ...current,
          ringToken: token,
          sourceMode: "ring",
          ringStatus: "ok",
          ringSyncedAt: new Date().toISOString(),
          ringDetail: data.message ?? "Synced metadata.",
        }));
      } catch {
        setSettings((current) => ({
          ...current,
          ringToken: token,
          sourceMode: "ring",
          ringStatus: "error",
          ringDetail: "The sync timed out. The simulated feed can take over.",
        }));
      } finally {
        setSyncing(false);
      }
    },
    updateCheckIn: (id, status, message) => {
      try {
        setCheckIns((items) => withCheckInStatus(items, id, status, message));
        setCheckInError("");
      } catch (error) {
        setCheckInError(error instanceof Error ? error.message : "That wording can't be saved.");
      }
    },
    addManualCheckIn,
    refreshHealth,
    clearLocal: () => {
      localStorage.removeItem(STORAGE_KEY);
      setSettings(defaultSettings);
      setBaseline(defaultBaseline);
      setRingEvents([]);
      setRingDevices([]);
      setCheckIns([]);
      setAutonomy([]);
      setDeviceRoles({});
      setRingAttempts(undefined);
    },
    readCareState,
    applyBaselinePatch,
  };

  return <CareContext.Provider value={value}>{children}</CareContext.Provider>;
}
