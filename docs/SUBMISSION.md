# Submission notes

**Project:** Caretaker Check-in  
**Owner:** Mark Yukhimets, Level Up Inc  
**Contest:** [Cognizant Open Agentic Web Challenge](https://cognizant-agenticweb.devpost.com/)  
**Deadline:** Monday, January 11, 2027, 8:00 AM PT  
**License:** MIT (`LICENSE`)  
**Spec:** [worldwide_agentic_web_mvp_spec.md](https://github.com/cognizant-ai-labs/agentic-web/blob/main/docs/worldwide_agentic_web_mvp_spec.md), profile 0.2

## What judges can click

1. Open the site. The demo clock is 10:45 and the feed is a labeled simulation of a quiet morning.
2. Read the daily note. Each line cites a device and time, or says no event is cited.
3. Open Check-ins. Approve the wording or copy it. Nothing is transmitted.
4. Open Companion and ask “How does this morning compare with the usual routine?” The trace shows `routine_reader` and `get_care_state`.
5. Ask “What is a check-in, and do you watch video?” The same-origin glossary network answers. A different origin asks before it is fetched.
6. Open Health. Template mode, Ring standby, and the verifier are visible.
7. Fetch `/agent-manifest.json`, `/caretaker_checkin.network.json`, and `/links.json`. They are public and send `Access-Control-Allow-Origin: *`.

## Spec checklist

| Requirement | Where it lives |
| --- | --- |
| Public agent-network JSON, data only, at least two agents | `public/caretaker_checkin.network.json`, `public/care_glossary.network.json` |
| Manifest with name, front agent, hocon, router hint, peer policy | `public/agent-manifest.json` |
| Peer link map | `public/links.json` |
| Browser runtime: validate, delegate, bound depth and steps, fail closed | `src/lib/runtime.ts` |
| User and agent UI | Today, Check-ins, Companion |
| Optional BYOK: router, model, key, delete | Companion sidebar. Same-origin `/api/llm` forwards a visitor key and does not replace it with `XAI_API_KEY` |
| Site tools the agent can call, writes confirmed in the browser | `get_care_state` (read), `draft_check_in` and `update_baseline` (confirm) |
| Private context deny-by-default; credential names never forwarded | Network metadata and `runAgentTurn` |
| Consent before another origin | Companion dialog |
| No web or X search on care data | Note request has no tools. The proxy strips search tool names |

The glossary is a second published network on this origin, which is how a judge can see a peer load without standing up another host. Point the glossary URL at another origin to exercise the consent dialog.

## Deploy on Vercel

The app is a Next.js App Router project.

1. Import the repository in Vercel. Framework preset: Next.js. No extra build command.
2. Set `XAI_API_KEY` and, if you want a different model, `XAI_MODEL` (default `grok-4.7`). `XAI_BASE_URL` defaults to `https://api.x.ai/v1`.
3. Leave the Ring token out of Vercel. Visitors paste a Playground token in Settings. It is not stored on the server.
4. Deploy. Confirm `https://<host>/agent-manifest.json` returns JSON and allows cross-origin GET.

Without `XAI_API_KEY`, the daily note uses the template and the companion runs in grounded mode. Both paths are part of the demo.

## Tests

`npm test` runs Vitest with no network: baseline comparison, the verifier, template fallback, unsent check-ins, retries and timeouts, Ring path policy, the Grok request body, and the browser runtime.

## Video

Use [DEMO_SCRIPT.md](DEMO_SCRIPT.md). Keep it under two minutes.
