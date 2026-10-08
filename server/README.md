# Poker Coach room server

Cloudflare Worker + one Durable Object (`RoomDO`) per room code. Imports the
one engine from `../src/poker` and the shared protocol from
`../src/multiplayer/protocol.ts`.

- `src/room.ts` — pure room logic (seats, host, tokens, action validation,
  bots, action clock, per-seat filtered views). Unit-tested in `test/`.
- `src/index.ts` — Worker routes + Durable Object wrapper (WebSocket
  Hibernation API, state persisted to DO storage after every event, DO alarm
  for the 30s action clock and 2h idle-room expiry).

Routes: `POST /api/rooms` → `{code}` · `GET /api/rooms/:code` → info ·
`GET /room/:code` (WebSocket) · `GET /health`.

## Local

Requires **Node ≥ 22** (wrangler 4).

```bash
cd server
npm install
npm test          # room logic unit tests (vitest)
npm run typecheck
npm run dev       # wrangler dev --local on http://localhost:8787 (no CF login needed)
npm run smoke     # in another shell: 4 WS clients play a few hands
```

Rate limits (per IP, per Worker isolate, 60s window): 10 room creates, 60 joins/room lookups → 429.
Requests with no Origin header (curl/Node) bypass the Origin check; browsers must be listed.

Client dev: `VITE_ROOM_SERVER_URL=http://localhost:8787 npm run dev` at the repo root
(that is also the client's default).

## Live

Deployed 2026-10-08 to Samir's Cloudflare account (workers.dev subdomain `samjreij94`):
**https://poker-coach-rooms.samjreij94.workers.dev** (`/health`; WebSocket at `wss://…/room/:code`). The production
client build reads it from `/.env.production` (`VITE_ROOM_SERVER_URL`, https; ws(s) is derived), so a plain
`npm run build` / `npm run deploy` at the repo root targets it. Redeploy with `cd server && npx wrangler deploy` (Node 22).
Live smoke: `ROOM_SERVER_URL=https://poker-coach-rooms.samjreij94.workers.dev ORIGIN=https://samjreij94.github.io npm run smoke`.

## Deploy (needs a Cloudflare account)

```bash
cd server
npm install
npx wrangler login              # or: export CLOUDFLARE_API_TOKEN=... (Workers Scripts:Edit + Durable Objects)
# CORS/WS Origin allow-list lives in wrangler.jsonc vars.ALLOWED_ORIGINS (Pages + localhost:5173/4173)
npx wrangler deploy             # creates Worker "poker-coach-rooms" + applies DO migration v1 (new_sqlite_classes: RoomDO)
```

Output URL: `https://poker-coach-rooms.<account-subdomain>.workers.dev`.
Durable Objects on the Workers **Free** plan require SQLite-backed classes,
which is what migration `v1` declares. No secrets are required.

Then build the PWA against it:

```bash
VITE_ROOM_SERVER_URL=https://poker-coach-rooms.<subdomain>.workers.dev npm run deploy   # repo root
```
