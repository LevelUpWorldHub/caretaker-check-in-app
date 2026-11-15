"use client";

import { useEffect, useRef, useState } from "react";
import { useCare } from "@/components/care-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { groundedComplete } from "@/lib/grounded";
import { resolvePublishedPeer } from "@/lib/peers";
import { createSiteActions } from "@/lib/site-actions";
import type { AgentNetwork, LlmMessage, ModelResponse, ModelTool, TraceEntry } from "@/lib/runtime";
import { runAgentTurn, type Completer } from "@/lib/runtime";

type ChatLine = { role: "you" | "companion"; text: string };
type Modal =
  | {
      kind: "confirm";
      action: string;
      args: Record<string, unknown>;
      resolve: (allowed: boolean) => void;
    }
  | {
      kind: "consent";
      origin: string;
      purpose: string;
      resolve: (allowed: boolean) => void;
    };

const PROMPTS = [
  "How does this morning compare with the usual routine?",
  "Draft a gentle check-in for me to approve.",
  "What is a check-in, and do you watch video?",
];

async function proxyComplete(
  settings: { useByok: boolean; byokKey: string; byokBaseUrl: string; byokModel: string },
  input: { messages: LlmMessage[]; tools: ModelTool[] },
): Promise<ModelResponse> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (settings.useByok && settings.byokKey) {
    headers.Authorization = `Bearer ${settings.byokKey}`;
    headers["x-router-base"] = settings.byokBaseUrl;
    headers["x-model"] = settings.byokModel;
  }
  const response = await fetch("/api/llm", {
    method: "POST",
    headers,
    body: JSON.stringify({ messages: input.messages, tools: input.tools }),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(data.message || "The model didn't answer.");
  }
  return (await response.json()) as ModelResponse;
}

export function AgentPanel() {
  const care = useCare();
  const [network, setNetwork] = useState<AgentNetwork | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState("");
  const [lines, setLines] = useState<ChatLine[]>([
    {
      role: "companion",
      text: "Ask about today's routine, or ask me to draft a check-in. I can read the page. I can't send a message.",
    },
  ]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [trace, setTrace] = useState<TraceEntry[]>([]);
  const [modeNote, setModeNote] = useState("The network is loaded from the public JSON on this site.");
  const [modal, setModal] = useState<Modal | null>(null);
  const [peerUrl, setPeerUrl] = useState("");
  const settled = useRef(false);

  useEffect(() => {
    let cancel = false;
    void Promise.all([
      fetch("/caretaker_checkin.network.json").then((response) => response.json()),
      fetch("/links.json").then((response) => response.json()),
    ])
      .then(([definition, linkFile]) => {
        if (cancel) return;
        setNetwork(definition as AgentNetwork);
        const map = (linkFile as { networks?: { caretaker_checkin?: Record<string, string> } }).networks
          ?.caretaker_checkin;
        setLinks(map ?? {});
      })
      .catch(() => {
        if (!cancel) setLoadError("The agent network file didn't load.");
      });
    return () => {
      cancel = true;
    };
  }, []);

  const closeModal = (allowed: boolean) => {
    if (settled.current) return;
    settled.current = true;
    modal?.resolve(allowed);
    setModal(null);
  };

  const ask = async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    if (!network) {
      setLoadError("The agent network is still loading.");
      return;
    }
    setBusy(true);
    setDraft("");
    setLines((current) => [...current, { role: "you", text: question }]);
    const secrets = [care.settings.ringToken, care.settings.byokKey].filter((value) => value.length >= 8);
    const actions = createSiteActions({
      read: () => care.readCareState(),
      draft: (args) => {
        const message = typeof args.message === "string" ? args.message : "";
        const reason = typeof args.reason === "string" ? args.reason : "Drafted from the companion.";
        const saved = care.addManualCheckIn(message, reason);
        return { ...saved, sent: false };
      },
      updateBaseline: (args) => care.applyBaselinePatch(args),
    });
    const wantsModel =
      care.settings.agentMode === "model" ||
      (care.settings.agentMode === "auto" &&
        ((care.settings.useByok && care.settings.byokKey.length > 0) ||
          (!care.settings.useByok && care.health.some((item) => item.id === "grok" && item.state === "ok"))));

    const run = (complete: Completer) =>
      runAgentTurn({
        network,
        frontMan: "care_companion",
        links,
        actions,
        userText: question,
        secrets,
        privateBag: { ringToken: care.settings.ringToken },
        callerOrigin: window.location.origin,
        complete,
        confirm: (proposal) =>
          new Promise((resolve) => {
            settled.current = false;
            setModal({ kind: "confirm", action: proposal.action, args: proposal.args, resolve });
          }),
        consentPeer: (origin, purpose) =>
          new Promise((resolve) => {
            settled.current = false;
            setModal({ kind: "consent", origin, purpose, resolve });
          }),
        resolvePeer: (ref) => resolvePublishedPeer(ref, links, window.location.origin),
      });

    try {
      let result = await run(wantsModel ? (input) => proxyComplete(care.settings, input) : groundedComplete);
      let note = wantsModel
        ? care.settings.useByok
          ? "Answered with your key. It went only to the router you named."
          : "Answered with the site Grok configuration. Web search and X search stay off."
        : "Grounded mode. The published network still ran, and it used this page's tools without a model call.";
      if (!result.ok && wantsModel) {
        result = await run(groundedComplete);
        note = "The model didn't finish, so this answer used grounded mode.";
      }
      setModeNote(note);
      setTrace(result.trace);
      setLines((current) => [...current, { role: "companion", text: result.text }]);
    } catch (error) {
      try {
        const result = await run(groundedComplete);
        setModeNote("The model call failed, so grounded mode answered from the page.");
        setTrace(result.trace);
        setLines((current) => [...current, { role: "companion", text: result.text }]);
      } catch (inner) {
        const message = inner instanceof Error ? inner.message : "The companion stopped.";
        setLines((current) => [...current, { role: "companion", text: message }]);
      }
      if (error instanceof Error) setModeNote(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <section className="grid gap-4">
        <div>
          <h2 className="text-3xl text-[#24352f]">Companion</h2>
          <p className="mt-2 text-lg leading-relaxed text-[#3e5148]">{modeNote}</p>
          {loadError ? <p className="mt-2 text-base text-[#6a3b28]">{loadError}</p> : null}
        </div>
        <div
          className="grid min-h-80 content-start gap-3 rounded-[1.4rem] bg-[#fffaf3] p-4 ring-1 ring-[#e4d8c8]"
          data-testid="agent-transcript"
          aria-live="polite"
        >
          {lines.map((line, index) => (
            <p
              key={`${line.role}-${index}`}
              className={
                line.role === "you"
                  ? "justify-self-end max-w-[40rem] rounded-2xl bg-[#e5f0ea] px-4 py-3 text-base leading-relaxed text-[#234237]"
                  : "max-w-[40rem] whitespace-pre-wrap text-lg leading-relaxed text-[#24352f]"
              }
            >
              {line.text}
            </p>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {PROMPTS.map((prompt) => (
            <Button
              key={prompt}
              type="button"
              variant="outline"
              className="h-auto bg-white px-3 py-2 text-left text-base whitespace-normal"
              onClick={() => void ask(prompt)}
            >
              {prompt}
            </Button>
          ))}
        </div>
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void ask(draft);
          }}
        >
          <Textarea
            className="min-h-24 text-base md:text-base"
            value={draft}
            placeholder="Ask about the morning, or ask for a check-in draft."
            onChange={(event) => setDraft(event.target.value)}
            aria-label="Message the companion"
          />
          <Button type="submit" className="h-12 w-fit px-5 text-base" disabled={busy}>
            {busy ? "Working…" : "Send"}
          </Button>
        </form>
        {trace.length > 0 ? (
          <ol className="grid gap-2" data-testid="agent-trace">
            {trace.map((entry) => (
              <li key={entry.id} className="rounded-xl bg-white px-3 py-2 text-sm leading-relaxed ring-1 ring-[#e4d8c8]">
                <span className="font-medium text-[#24352f]">{entry.title}. </span>
                {entry.detail}
              </li>
            ))}
          </ol>
        ) : null}
      </section>

      <aside className="grid content-start gap-4 rounded-[1.4rem] bg-white p-4 ring-1 ring-[#e4d8c8]">
        <h3 className="text-xl text-[#24352f]">Model</h3>
        <label className="grid gap-2 text-base">
          <span>How to answer</span>
          <select
            className="h-12 rounded-lg border border-input bg-transparent px-3"
            value={care.settings.agentMode}
            onChange={(event) =>
              care.updateSettings({ agentMode: event.target.value as "auto" | "grounded" | "model" })
            }
          >
            <option value="auto">Automatic</option>
            <option value="grounded">Grounded, no model call</option>
            <option value="model">Model only, then fall back</option>
          </select>
        </label>
        <label className="flex items-center justify-between gap-3 text-base">
          <span>Use my key</span>
          <input
            type="checkbox"
            className="size-5"
            checked={care.settings.useByok}
            onChange={(event) => care.updateSettings({ useByok: event.target.checked })}
          />
        </label>
        <label className="grid gap-2 text-base">
          <span>Router</span>
          <Input
            className="h-12 text-base md:text-base"
            value={care.settings.byokBaseUrl}
            onChange={(event) => care.updateSettings({ byokBaseUrl: event.target.value })}
          />
        </label>
        <label className="grid gap-2 text-base">
          <span>Model</span>
          <Input
            className="h-12 text-base md:text-base"
            value={care.settings.byokModel}
            onChange={(event) => care.updateSettings({ byokModel: event.target.value })}
          />
        </label>
        <label className="grid gap-2 text-base">
          <span>Key</span>
          <Input
            className="h-12 text-base md:text-base"
            type="password"
            autoComplete="off"
            value={care.settings.byokKey}
            onChange={(event) => care.updateSettings({ byokKey: event.target.value })}
          />
        </label>
        <Button
          type="button"
          variant="outline"
          className="h-12 bg-white text-base"
          onClick={() => care.updateSettings({ byokKey: "", useByok: false })}
        >
          Delete saved key
        </Button>
        <p className="text-sm leading-relaxed text-[#6d6256]">
          With your key on, the same-origin proxy forwards it and does not use the server key. The key is not written
          into the network JSON, the prompt, or a peer request.
        </p>
        <label className="grid gap-2 text-base">
          <span>Load another published network</span>
          <Input
            className="h-12 text-base md:text-base"
            value={peerUrl}
            placeholder="https://example.com/care_glossary"
            onChange={(event) => setPeerUrl(event.target.value)}
          />
        </label>
        <Button
          type="button"
          variant="outline"
          className="h-12 bg-white text-base"
          onClick={() => {
            if (!peerUrl.trim()) return;
            setLinks((current) => ({ ...current, care_glossary: peerUrl.trim() }));
            setModeNote("The glossary link now points at that URL. The next glossary question will ask before leaving this site.");
          }}
        >
          Use this glossary URL
        </Button>
      </aside>

      <Dialog open={Boolean(modal)} onOpenChange={(open) => { if (!open) closeModal(false); }}>
        <DialogContent className="sm:max-w-lg">
          {modal?.kind === "confirm" ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl">Confirm this page change</DialogTitle>
                <DialogDescription className="text-base leading-relaxed">
                  {modal.action === "draft_check_in"
                    ? "Saving a draft still does not send it."
                    : "This updates the routine saved in this browser."}
                </DialogDescription>
              </DialogHeader>
              <pre className="max-h-60 overflow-auto rounded-xl bg-[#f7f1e6] p-3 text-sm whitespace-pre-wrap">
                {JSON.stringify(modal.args, null, 2)}
              </pre>
              <DialogFooter>
                <Button type="button" variant="outline" className="h-11" onClick={() => closeModal(false)}>
                  Not now
                </Button>
                <Button type="button" className="h-11" data-testid="confirm-action" onClick={() => closeModal(true)}>
                  Confirm
                </Button>
              </DialogFooter>
            </>
          ) : modal?.kind === "consent" ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl">Load a network from {modal.origin}?</DialogTitle>
                <DialogDescription className="text-base leading-relaxed">
                  {modal.purpose} It runs here, on your key if you set one. That site does not receive the key, and it
                  does not get this page&apos;s tools.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button type="button" variant="outline" className="h-11" onClick={() => closeModal(false)}>
                  Don&apos;t load it
                </Button>
                <Button type="button" className="h-11" onClick={() => closeModal(true)}>
                  Load it
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
