import type { Baseline, Settings } from "@/lib/types";

export const defaultBaseline: Baseline = {
  wakeStart: "07:00",
  wakeEnd: "08:30",
  morningCheckBy: "09:30",
  doorStart: "08:00",
  doorEnd: "11:00",
  lunchStart: "11:30",
  lunchEnd: "13:30",
  dinnerStart: "17:30",
  dinnerEnd: "19:30",
  eveningStart: "19:30",
  eveningSettleBy: "21:30",
};

export const defaultSettings: Settings = {
  relativeName: "Elena",
  caregiverName: "",
  sourceMode: "simulated",
  scenario: "quiet-morning",
  clockMode: "demo",
  demoTime: "10:45",
  ringToken: "",
  ringStatus: "idle",
  ringSyncedAt: null,
  ringDetail: "No Ring token yet. The simulated feed is on.",
  byokBaseUrl: "https://api.x.ai/v1",
  byokModel: "grok-4.7",
  byokKey: "",
  useByok: false,
  agentMode: "auto",
};

export const SCENARIO_LABEL: Record<Settings["scenario"], string> = {
  "quiet-morning": "Quiet morning",
  steady: "Steady day",
  "restless-evening": "Movement after settle time",
};
