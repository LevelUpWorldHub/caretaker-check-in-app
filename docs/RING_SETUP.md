# Ring setup

Caretaker Check-in reads the official Ring Partner API at `https://api.amazonvision.com`. It uses a token you paste from the [Ring Developer Playground](https://developer.amazon.com/ring/console/playground). The demo does not need one.

Reference: [Ring Partner API](https://developer.amazon.com/docs/ring/api-documentation.html) and the [event history](https://developer.amazon.com/docs/ring/api-documentation.html) section. A Playground walkthrough is in [AmazonAppDev/ring-api-helloworld](https://github.com/AmazonAppDev/ring-api-helloworld).

## Paste a token

1. Open the Playground and generate an access token.
2. In this app, open Settings and paste it into Ring Playground token.
3. Choose Sync door and motion metadata.

The browser sends the token to `POST /api/ring/sync` on this site. The server calls Ring and does not write the token to disk. The browser keeps it in `localStorage` so you can sync again. Clear saved data removes it.

Playground tokens are short-lived, on the order of 30 minutes. When Ring returns 401 or 403, the health row and the banner say the token expired. Generate another one. The app does not retry a 401.

## What is requested

For each device, at most five:

- `GET /v1/devices`
- `GET /v1/history/devices/{device_id}/events?event_types=ding,motion`

History pages follow `links.next` for up to three pages, and stop once events are older than the local day. `on_demand` live-view rows are ignored. Motion and doorbell rows become metadata: id, device name, type, start, end.

The role (door, kitchen, or other) is guessed from the device name. You can correct it in Settings. Door windows count the door role. Meals count the kitchen role. Wake and the morning check count any door or motion event.

## What is not requested

The client refuses paths that contain media, streaming, download, WHEP, or RTSP. There is no snapshot, clip, or livestream call. `is_third_party_reviewed` is not used, because this app does not download media.

Account email is not requested. `GET /v1/users/me` is not called.

## Empty history

A Playground token can be valid and still return no events. History is limited to the period after consent, and the Playground does not invent motion. The page says the list is empty. Switch back to the simulated feed to keep walking through the note and the check-in.

## Local override

`RING_API_BASE` can point at another host that speaks the same JSON. Leave it unset to use `https://api.amazonvision.com`.
