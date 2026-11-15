import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { groundedComplete } from "@/lib/grounded";
import { runAgentTurn, validateArgs, validateNetwork, type AgentNetwork, type SiteAction } from "@/lib/runtime";
import manifest from "../public/agent-manifest.json";
import network from "../public/caretaker_checkin.network.json";
import glossary from "../public/care_glossary.network.json";
import links from "../public/links.json";

const published = network as AgentNetwork;
const linkMap = links.networks.caretaker_checkin;

describe("published agent network", () => {
  it("validates the public files", () => {
    expect(validateNetwork(published, manifest.networks[0]!.front_man, linkMap)).toEqual([]);
    expect(validateNetwork(glossary as AgentNetwork, "glossary_guide")).toEqual([]);
    expect(manifest.networks.map((item) => item.name)).toEqual(["caretaker_checkin", "care_glossary"]);
    const raw = [
      readFileSync("public/caretaker_checkin.network.json", "utf8"),
      readFileSync("public/agent-manifest.json", "utf8"),
    ].join("\n");
    expect(raw).not.toMatch(/xai-[A-Za-z0-9]{10,}/);
    expect(raw).toContain("downstream_fields");
    expect(raw).toContain("get_care_state");
  });

  it("rejects a duplicate name, a missing front agent, and an unknown tool", () => {
    expect(validateNetwork({ tools: [{ name: "a", tools: [] }, { name: "a", tools: [] }] }, "a").join(" ")).toMatch(/Duplicate/);
    expect(validateNetwork({ tools: [{ name: "a", tools: [] }, { name: "b", tools: [] }] }, "missing").join(" ")).toMatch(/Front agent/);
    expect(
      validateNetwork({ tools: [{ name: "a", tools: ["nope"] }, { name: "b", tools: [] }] }, "a").join(" "),
    ).toMatch(/unknown agent/);
  });
});

describe("browser runtime", () => {
  const state = {
    relativeName: "Elena",
    asOfLabel: "10:45 AM",
    windows: [
      { label: "Morning check", status: "missed", detail: "No door or motion events arrived before 09:30." },
    ],
    note: { source: "template", lines: [{ text: "No door or motion events arrived before 09:30." }] },
    pendingCheckIns: [],
    suggestedCheckIn: "Hello — this is a small check-in, not an alarm. It has not been sent.",
    morningMissed: true,
  };

  function actions(handlers?: Partial<{ draft: SiteAction["handler"] }>): SiteAction[] {
    return [
      {
        name: "get_care_state",
        description: "Read",
        effect: "read",
        schema: { type: "object", properties: {} },
        handler: () => state,
      },
      {
        name: "draft_check_in",
        description: "Draft",
        effect: "write",
        schema: {
          type: "object",
          properties: { message: { type: "string" }, reason: { type: "string" } },
          required: ["message"],
        },
        handler: handlers?.draft ?? (() => ({ drafted: true, sent: false })),
      },
    ];
  }

  it("answers a morning question by calling the page tool", async () => {
    let reads = 0;
    const result = await runAgentTurn({
      network: published,
      frontMan: "care_companion",
      links: linkMap,
      actions: actions({
        draft: () => {
          throw new Error("draft should not run");
        },
      }).map((action) =>
        action.name === "get_care_state"
          ? { ...action, handler: () => {
              reads += 1;
              return state;
            } }
          : action,
      ),
      userText: "How does this morning compare with the usual routine?",
      complete: groundedComplete,
      callerOrigin: "http://localhost",
    });
    expect(result.ok).toBe(true);
    expect(reads).toBeGreaterThan(0);
    expect(result.text).toContain("09:30");
    expect(result.text.toLowerCase()).not.toContain("sent a message");
    expect(result.trace.some((entry) => entry.title === "get_care_state")).toBe(true);
  });

  it("does not call a write handler when confirmation is declined", async () => {
    let drafts = 0;
    const result = await runAgentTurn({
      network: published,
      frontMan: "care_companion",
      links: linkMap,
      actions: actions({
        draft: () => {
          drafts += 1;
          return { drafted: true };
        },
      }),
      userText: "Draft a gentle check-in for me to approve.",
      complete: groundedComplete,
      confirm: async () => false,
      callerOrigin: "http://localhost",
    });
    expect(drafts).toBe(0);
    expect(result.text).toContain("wasn't confirmed");
    expect(result.trace.some((entry) => entry.title === "Not applied")).toBe(true);
  });

  it("redacts secrets and does not forward a token to a peer", async () => {
    const seen: string[] = [];
    const result = await runAgentTurn({
      network: published,
      frontMan: "care_companion",
      links: linkMap,
      userText: "What is a check-in, and do you watch video? token super-secret-token-value",
      secrets: ["super-secret-token-value"],
      privateBag: { ringToken: "super-secret-token-value", note: "keep" },
      callerOrigin: "http://localhost:43123",
      complete: async (input) => {
        seen.push(JSON.stringify(input.messages));
        return groundedComplete(input);
      },
      consentPeer: async () => true,
      resolvePeer: async () => ({
        network: glossary as AgentNetwork,
        frontMan: "glossary_guide",
        origin: "http://localhost:43123",
      }),
    });
    expect(result.ok).toBe(true);
    expect(seen.join("\n")).not.toContain("super-secret-token-value");
    expect(result.text.toLowerCase()).toContain("metadata");
  });

  it("stops a denied origin before resolving the peer", async () => {
    let resolved = 0;
    const result = await runAgentTurn({
      network: published,
      frontMan: "care_companion",
      links: { care_glossary: "https://peer.example/care_glossary" },
      userText: "What is a check-in, and do you watch video?",
      callerOrigin: "http://localhost:43123",
      complete: groundedComplete,
      consentPeer: async (origin) => {
        expect(origin).toBe("https://peer.example");
        return false;
      },
      resolvePeer: async () => {
        resolved += 1;
        throw new Error("should not resolve");
      },
    });
    expect(resolved).toBe(0);
    expect(result.trace.some((entry) => entry.title === "Peer declined")).toBe(true);
    expect(result.ok).toBe(true);
  });

  it("does not call the model for an invalid network", async () => {
    let calls = 0;
    const result = await runAgentTurn({
      network: { tools: [{ name: "only", tools: [] }] },
      frontMan: "missing",
      userText: "Hello",
      complete: async () => {
        calls += 1;
        return { content: "no" };
      },
    });
    expect(calls).toBe(0);
    expect(result.ok).toBe(false);
    expect(result.text).toMatch(/Front agent|at least two/);
  });

  it("stops when the invocation budget is used up", async () => {
    const looping: AgentNetwork = {
      tools: [
        { name: "a", instructions: "loop", tools: ["b"] },
        { name: "b", instructions: "loop", tools: ["a"] },
      ],
    };
    const result = await runAgentTurn({
      network: looping,
      frontMan: "a",
      userText: "go",
      limits: { maxInvocations: 3, maxDepth: 6, maxRounds: 2 },
      complete: async (input) => ({
        content: "",
        toolCalls: [{ id: "1", name: input.agent === "a" ? "b" : "a", arguments: { inquiry: "again" } }],
      }),
    });
    expect(result.ok).toBe(false);
    expect(result.text).toMatch(/budget/i);
  });

  it("rejects unexpected tool fields", () => {
    expect(validateArgs({ type: "object", properties: { message: { type: "string" } }, required: ["message"] }, { message: "hi", token: "x" })).toContain(
      "Unexpected field token.",
    );
  });
});
