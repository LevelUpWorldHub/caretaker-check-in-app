export type JsonSchema = {
  type?: string;
  properties?: Record<string, JsonSchema & { description?: string }>;
  required?: string[];
  items?: JsonSchema;
};

export type AgentToolRef = string | { url: string; tools?: string[] };

export type AgentNode = {
  name: string;
  function?: {
    description?: string;
    parameters?: JsonSchema;
  };
  instructions?: string;
  tools?: AgentToolRef[];
};

export type AgentNetwork = {
  metadata?: {
    description?: string;
    private_context?: {
      deny_by_default?: boolean;
      downstream_fields?: string[];
      upstream_fields?: string[];
    };
  };
  tools: AgentNode[];
};

export type SiteAction = {
  name: string;
  description: string;
  effect: "read" | "write";
  schema?: JsonSchema;
  handler: (args: Record<string, unknown>) => Promise<unknown> | unknown;
};

export type ToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type LlmMessage =
  | { role: "system" | "user"; content: string }
  | {
      role: "assistant";
      content: string;
      tool_calls?: {
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }[];
    }
  | { role: "tool"; tool_call_id: string; content: string };

export type ModelTool = {
  type: "function";
  function: { name: string; description: string; parameters: JsonSchema };
};

export type ModelResponse = {
  content: string;
  toolCalls?: ToolCall[];
};

export type Completer = (input: {
  agent: string;
  messages: LlmMessage[];
  tools: ModelTool[];
}) => Promise<ModelResponse> | ModelResponse;

export type TraceEntry = {
  id: string;
  kind: "agent" | "tool" | "confirm" | "peer" | "error" | "limit";
  title: string;
  detail: string;
};

const CREDENTIAL_KEYS = new Set([
  "ringtoken",
  "token",
  "apikey",
  "byokkey",
  "authorization",
  "secret",
  "password",
]);

export function validateArgs(schema: JsonSchema | undefined, args: unknown): string[] {
  if (!schema) return [];
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return ["Arguments must be an object."];
  }
  const record = args as Record<string, unknown>;
  const errors: string[] = [];
  for (const key of schema.required ?? []) {
    if (record[key] === undefined || record[key] === "") errors.push(`Missing ${key}.`);
  }
  for (const [key, value] of Object.entries(record)) {
    const prop = schema.properties?.[key];
    if (!prop) {
      errors.push(`Unexpected field ${key}.`);
      continue;
    }
    if (prop.type === "string" && typeof value !== "string") errors.push(`${key} must be a string.`);
    if (prop.type === "number" && typeof value !== "number") errors.push(`${key} must be a number.`);
    if (prop.type === "boolean" && typeof value !== "boolean") errors.push(`${key} must be a boolean.`);
    if (prop.type === "array" && !Array.isArray(value)) errors.push(`${key} must be an array.`);
  }
  return errors;
}

export function validateNetwork(
  network: AgentNetwork,
  frontMan: string,
  links: Record<string, string> = {},
): string[] {
  const errors: string[] = [];
  if (!network || !Array.isArray(network.tools)) {
    return ["Network definition is missing its agent list."];
  }
  if (network.tools.length < 2) errors.push("Network needs at least two agents.");
  const names = new Set<string>();
  for (const agent of network.tools) {
    if (!agent?.name) {
      errors.push("An agent is missing a name.");
      continue;
    }
    if (names.has(agent.name)) errors.push(`Duplicate agent ${agent.name}.`);
    names.add(agent.name);
  }
  if (!names.has(frontMan)) errors.push(`Front agent ${frontMan} is not in the network.`);
  for (const agent of network.tools) {
    for (const tool of agent.tools ?? []) {
      if (typeof tool !== "string") {
        if (!tool.url) errors.push(`${agent.name} has a tool without a url.`);
        continue;
      }
      if (tool.includes("://") || tool.startsWith("/")) continue;
      if (!names.has(tool) && !links[tool]) {
        errors.push(`${agent.name} references unknown agent ${tool}.`);
      }
    }
  }
  return errors;
}

function redact(text: string, secrets: string[]): string {
  let next = text;
  for (const secret of secrets) {
    if (secret && secret.length >= 8) next = next.split(secret).join("[redacted]");
  }
  return next;
}

function downstreamFields(network: AgentNetwork): string[] {
  const listed = network.metadata?.private_context?.downstream_fields ?? [];
  return listed.filter((field) => !CREDENTIAL_KEYS.has(field.toLowerCase()));
}

function projectPrivate(
  bag: Record<string, unknown> | undefined,
  fields: string[],
): Record<string, unknown> {
  if (!bag || fields.length === 0) return {};
  const projected: Record<string, unknown> = {};
  for (const field of fields) {
    if (CREDENTIAL_KEYS.has(field.toLowerCase())) continue;
    if (field in bag) projected[field] = bag[field];
  }
  return projected;
}

function toolRefName(tool: AgentToolRef): string {
  if (typeof tool === "string") return tool;
  try {
    const url = new URL(tool.url);
    return url.pathname.split("/").filter(Boolean).pop() || tool.url;
  } catch {
    return tool.url;
  }
}

export async function runAgentTurn(options: {
  network: AgentNetwork;
  frontMan: string;
  links?: Record<string, string>;
  actions?: SiteAction[];
  userText: string;
  secrets?: string[];
  privateBag?: Record<string, unknown>;
  callerOrigin?: string;
  complete: Completer;
  confirm?: (proposal: {
    action: string;
    args: Record<string, unknown>;
    effect: "write";
  }) => Promise<boolean>;
  resolvePeer?: (ref: string) => Promise<{ network: AgentNetwork; frontMan: string; origin: string }>;
  consentPeer?: (origin: string, purpose: string) => Promise<boolean>;
  limits?: { maxDepth?: number; maxInvocations?: number; maxMs?: number; maxRounds?: number };
  now?: () => number;
}): Promise<{ text: string; trace: TraceEntry[]; ok: boolean }> {
  const links = options.links ?? {};
  const errors = validateNetwork(options.network, options.frontMan, links);
  const trace: TraceEntry[] = [];
  const push = (entry: Omit<TraceEntry, "id">) => {
    trace.push({ ...entry, id: `t${trace.length + 1}` });
  };
  if (errors.length) {
    for (const error of errors) push({ kind: "error", title: "Invalid network", detail: error });
    return { text: errors.join(" "), trace, ok: false };
  }

  const limits = {
    maxDepth: options.limits?.maxDepth ?? 4,
    maxInvocations: options.limits?.maxInvocations ?? 8,
    maxMs: options.limits?.maxMs ?? 20_000,
    maxRounds: options.limits?.maxRounds ?? 4,
  };
  const started = (options.now ?? Date.now)();
  const secrets = options.secrets ?? [];
  let invocations = 0;
  let remotePeers = 0;
  const actions = options.actions ?? [];

  const fail = (title: string, detail: string, kind: TraceEntry["kind"] = "limit") => {
    push({ kind, title, detail });
    return { text: detail, trace, ok: false as const };
  };

  const callAgent = async (
    network: AgentNetwork,
    agentName: string,
    inputText: string,
    depth: number,
    peer: boolean,
    peerOrigin?: string,
  ): Promise<string> => {
    if ((options.now ?? Date.now)() - started > limits.maxMs) {
      throw Object.assign(new Error("The time budget for this turn was used up."), { code: "limit" });
    }
    invocations += 1;
    if (invocations > limits.maxInvocations) {
      throw Object.assign(new Error("The agent step budget was used up."), { code: "limit" });
    }
    if (depth > limits.maxDepth) {
      throw Object.assign(new Error("The agent depth budget was used up."), { code: "limit" });
    }
    const agent = network.tools.find((item) => item.name === agentName);
    if (!agent) throw new Error(`Agent ${agentName} is not in the network.`);
    push({
      kind: "agent",
      title: peer ? `Peer agent ${agent.name}` : `Agent ${agent.name}`,
      detail: peerOrigin ? `Running locally. Origin of the definition: ${peerOrigin}.` : "Running in this browser.",
    });

    const modelTools: ModelTool[] = [];
    for (const tool of agent.tools ?? []) {
      const name = toolRefName(tool);
      if (typeof tool === "string" && network.tools.some((item) => item.name === tool)) {
        const child = network.tools.find((item) => item.name === tool)!;
        modelTools.push({
          type: "function",
          function: {
            name,
            description: child.function?.description ?? `Delegate to ${name}.`,
            parameters: child.function?.parameters ?? {
              type: "object",
              properties: { inquiry: { type: "string" } },
            },
          },
        });
        continue;
      }
      modelTools.push({
        type: "function",
        function: {
          name,
          description: `Call the published peer network ${name}. It runs in this browser after any required approval.`,
          parameters: {
            type: "object",
            properties: { inquiry: { type: "string", description: "What to ask the peer network." } },
            required: ["inquiry"],
          },
        },
      });
    }
    if (!peer) {
      for (const action of actions) {
        modelTools.push({
          type: "function",
          function: {
            name: `website_${action.name}`,
            description: action.description,
            parameters: action.schema ?? { type: "object", properties: {} },
          },
        });
      }
    }

    const privateNote = peer
      ? "Private context forwarded to this peer: none."
      : "Private credentials stay out of the prompt.";
    const messages: LlmMessage[] = [
      {
        role: "system",
        content: redact(
          `${agent.instructions ?? ""}\n${privateNote}\nNever claim a message was sent. Never diagnose. Never request video.`,
          secrets,
        ),
      },
      { role: "user", content: redact(inputText, secrets) },
    ];

    for (let round = 0; round < limits.maxRounds; round += 1) {
      const response = await options.complete({ agent: agent.name, messages, tools: modelTools });
      const calls = response.toolCalls ?? [];
      if (!calls.length) return redact(response.content || "I don't have anything further to add.", secrets);
      messages.push({
        role: "assistant",
        content: response.content ?? "",
        tool_calls: calls.map((call) => ({
          id: call.id,
          type: "function",
          function: { name: call.name, arguments: JSON.stringify(call.arguments) },
        })),
      });
      for (const call of calls) {
        const result = await dispatchTool(network, agent, call, depth, peer);
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: redact(JSON.stringify(result), secrets),
        });
      }
    }
    return "I paused at the step limit so this turn stays bounded. You can ask again.";
  };

  const dispatchTool = async (
    network: AgentNetwork,
    agent: AgentNode,
    call: ToolCall,
    depth: number,
    peer: boolean,
  ): Promise<unknown> => {
    const local = network.tools.find((item) => item.name === call.name);
    if (local) {
      const inquiry =
        typeof call.arguments.inquiry === "string"
          ? call.arguments.inquiry
          : typeof call.arguments.question === "string"
            ? call.arguments.question
            : typeof call.arguments.reason === "string"
              ? call.arguments.reason
              : "";
      const text = await callAgent(network, local.name, inquiry, depth + 1, peer);
      return { name: local.name, result: text };
    }

    if (call.name.startsWith("website_")) {
      if (peer) {
        push({
          kind: "error",
          title: "Site tool blocked",
          detail: `${call.name} is not available to a peer network.`,
        });
        return { ok: false, error: "Peer networks cannot use this site's tools." };
      }
      const action = actions.find((item) => `website_${item.name}` === call.name);
      if (!action) return { ok: false, error: `Unknown site tool ${call.name}.` };
      const problems = validateArgs(action.schema, call.arguments);
      if (problems.length) {
        push({ kind: "error", title: action.name, detail: problems.join(" ") });
        return { ok: false, error: problems.join(" ") };
      }
      if (action.effect === "write") {
        push({
          kind: "confirm",
          title: `Confirm ${action.name}`,
          detail: "A write waits for you. The model cannot confirm it.",
        });
        const allowed = options.confirm
          ? await options.confirm({ action: action.name, args: call.arguments, effect: "write" })
          : false;
        if (!allowed) {
          push({ kind: "confirm", title: "Not applied", detail: `${action.name} was not confirmed.` });
          return { ok: false, error: "The caregiver did not confirm this." };
        }
      }
      try {
        const value = await action.handler(call.arguments);
        push({
          kind: "tool",
          title: action.name,
          detail: action.effect === "read" ? "Read the page state." : "Applied after confirmation.",
        });
        return { name: action.name, ok: true, result: value };
      } catch (error) {
        const message = error instanceof Error ? error.message : "The site tool failed.";
        push({ kind: "error", title: action.name, detail: message });
        return { ok: false, error: message };
      }
    }

    const ref = (agent.tools ?? []).find((tool) => toolRefName(tool) === call.name);
    if (!ref) return { ok: false, error: `Unknown tool ${call.name}.` };
    if (remotePeers >= 2) {
      return { ok: false, error: "The peer-call budget was used up." };
    }
    const raw = typeof ref === "string" ? (links[ref] ?? ref) : ref.url;
    let origin = options.callerOrigin ?? "http://localhost";
    try {
      origin = new URL(raw, options.callerOrigin ?? "http://localhost").origin;
    } catch {
      origin = "invalid";
    }
    const caller = options.callerOrigin ?? "http://localhost";
    if (origin !== caller) {
      push({
        kind: "peer",
        title: "Approval needed",
        detail: `Contact ${origin} to load a published agent network.`,
      });
      const allowed = options.consentPeer
        ? await options.consentPeer(origin, "Load a published agent network and run it in this browser.")
        : false;
      if (!allowed) {
        push({ kind: "error", title: "Peer declined", detail: `${origin} was not approved.` });
        return { ok: false, error: `Contact with ${origin} was not approved.` };
      }
    }
    if (!options.resolvePeer) {
      return { ok: false, error: "This runtime cannot resolve that peer network." };
    }
    remotePeers += 1;
    try {
      const resolved = await options.resolvePeer(typeof ref === "string" ? ref : raw);
      if (resolved.origin !== origin && resolved.origin !== caller) {
        const allowed = options.consentPeer
          ? await options.consentPeer(resolved.origin, "The network definition redirected to another origin.")
          : false;
        if (!allowed) return { ok: false, error: `Redirect to ${resolved.origin} was not approved.` };
      }
      const peerErrors = validateNetwork(resolved.network, resolved.frontMan);
      if (peerErrors.length) {
        push({ kind: "error", title: "Peer network rejected", detail: peerErrors.join(" ") });
        return { ok: false, error: peerErrors.join(" ") };
      }
      const allowedPrivate = projectPrivate(options.privateBag, downstreamFields(options.network));
      const inquiry =
        typeof call.arguments.inquiry === "string" ? call.arguments.inquiry : options.userText;
      const privateSuffix =
        Object.keys(allowedPrivate).length > 0 ? `\nShared fields: ${JSON.stringify(allowedPrivate)}` : "";
      const text = await callAgent(
        resolved.network,
        resolved.frontMan,
        `${inquiry}${privateSuffix}`,
        depth + 1,
        true,
        resolved.origin,
      );
      return { name: resolved.frontMan, result: text };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Peer load failed.";
      push({ kind: "error", title: "Peer failed", detail: message });
      return { ok: false, error: message };
    }
  };

  try {
    const text = await callAgent(options.network, options.frontMan, redact(options.userText, secrets), 1, false);
    return { text, trace, ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The agent turn stopped.";
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    return fail(code === "limit" ? "Budget reached" : "Agent turn stopped", message, code === "limit" ? "limit" : "error");
  }
}
