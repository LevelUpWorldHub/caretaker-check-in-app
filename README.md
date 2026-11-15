# Caretaker Check-in

A calm daily note for someone looking after a relative who lives alone. The page watches door and motion **metadata** against a routine you can edit. When the morning is quiet, it drafts a gentle check-in and waits. Nothing is sent unless you copy it yourself.

Built by Mark Yukhimets, Level Up Inc, for the [Cognizant Open Agentic Web Challenge](https://cognizant-agenticweb.devpost.com/). The agent network follows the [minimum viable specification](https://github.com/cognizant-ai-labs/agentic-web/blob/main/docs/worldwide_agentic_web_mvp_spec.md).

## Run locally

```bash
npm install
cp .env.example .env.local   # optional: add XAI_API_KEY
npm run dev
```

Open [http://127.0.0.1:43123](http://127.0.0.1:43123).

The demo clock starts at 10:45 on a simulated quiet morning, so the check-in is visible without a Ring token and without a Grok key. Switch the day under Settings, or paste a [Ring Developer Playground](https://developer.amazon.com/ring/console/playground) token. See [docs/RING_SETUP.md](docs/RING_SETUP.md).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js on port 43123 |
| `npm test` | Vitest. No network. |
| `npm run lint` | ESLint |
| `npm run build` | Production build |

## What the page does

- Compares wake, door, meals, evening, and settle windows with door and motion events.
- Asks Grok (`XAI_MODEL`, default `grok-4.7`) for a note that cites those events. Web search and X search are not enabled. A verifier drops medical or emergency claims, and a template writes the same kind of bullets when the model is absent or refused.
- Drafts a check-in when there is no morning activity by the time you set. You approve or dismiss it. The app has no send button.
- Publishes `agent-manifest.json`, `caretaker_checkin.network.json`, and `links.json`. The companion runs that network in the browser and can call the page's tools. A key, if you add one, stays in the browser and is forwarded only to the router you name.

More detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/SUBMISSION.md](docs/SUBMISSION.md), [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md).
