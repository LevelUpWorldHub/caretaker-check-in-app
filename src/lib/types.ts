export type DeviceRole = "door" | "kitchen" | "other";

export type Scenario = "quiet-morning" | "steady" | "restless-evening";

export type ClockMode = "demo" | "live";

export type FeedSource = "simulated" | "ring";

export type Baseline = {
  wakeStart: string;
  wakeEnd: string;
  morningCheckBy: string;
  doorStart: string;
  doorEnd: string;
  lunchStart: string;
  lunchEnd: string;
  dinnerStart: string;
  dinnerEnd: string;
  eveningStart: string;
  eveningSettleBy: string;
};

export type CareEvent = {
  id: string;
  source: FeedSource;
  deviceId: string;
  deviceName: string;
  role: DeviceRole;
  eventType: "motion" | "ding";
  subtype?: string;
  startMs: number;
  endMs: number;
};

export type RingDevice = {
  id: string;
  name: string;
  role: DeviceRole;
};

export type WindowCode =
  | "wake"
  | "morning_check"
  | "door"
  | "lunch"
  | "dinner"
  | "evening"
  | "settle";

export type WindowStatus = "upcoming" | "in_progress" | "met" | "missed";

export type WindowResult = {
  code: WindowCode;
  label: string;
  status: WindowStatus;
  eventIds: string[];
  detail: string;
  checkIn: boolean;
};

export type Comparison = {
  asOf: string;
  dayKey: string;
  windows: WindowResult[];
  deviations: WindowResult[];
};

export type NoteLine = {
  text: string;
  eventIds: string[];
};

export type DailyNote = {
  source: "grok" | "template";
  model?: string;
  lines: NoteLine[];
  verifier: {
    passed: boolean;
    reasons: string[];
    heldBack: boolean;
  };
  generatedAt: string;
  detail: string;
};

export type CheckInStatus = "draft" | "approved" | "copied" | "dismissed";

export type CheckIn = {
  id: string;
  dayKey: string;
  code: WindowCode | "manual";
  reason: string;
  message: string;
  eventIds: string[];
  status: CheckInStatus;
  createdAt: string;
  updatedAt: string;
  autonomous: boolean;
  /** Check-ins are never transmitted by this app. */
  sent: false;
};

export type AutonomyEntry = {
  id: string;
  dayKey: string;
  at: string;
  text: string;
};

export type HealthState = "ok" | "degraded" | "down" | "standby";

export type HealthItem = {
  id: string;
  label: string;
  state: HealthState;
  detail: string;
  checkedAt: string;
  attempts?: number;
};

export type Settings = {
  relativeName: string;
  caregiverName: string;
  sourceMode: FeedSource;
  scenario: Scenario;
  clockMode: ClockMode;
  demoTime: string;
  ringToken: string;
  ringStatus: "idle" | "ok" | "expired" | "error";
  ringSyncedAt: string | null;
  ringDetail: string;
  byokBaseUrl: string;
  byokModel: string;
  byokKey: string;
  useByok: boolean;
  agentMode: "auto" | "grounded" | "model";
};

export type FeedInfo = {
  source: FeedSource;
  label: string;
  simulated: boolean;
  detail: string;
};
