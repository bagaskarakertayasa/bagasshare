# Bagas Share

Fast, login-free file transfer between devices in the browser. Live at **[bagasshare.web.id](https://bagasshare.web.id)**.

Devices on the same Wi-Fi detect each other automatically and transfer files directly peer-to-peer over WebRTC DataChannels. Files larger than 500 MB (up to 5 GB) are automatically routed through Cloudflare R2 multipart uploads to generate a single-download link valid for 6 hours—even when no recipient device is currently online.

---

## Features

- **Zero login, zero installation** — Works directly in Chrome, Safari (iOS), and Firefox on desktop and mobile.
- **Automatic local network discovery** — Devices sharing the same public IP (IPv4 or IPv6 `/64` prefix) appear in real time (up to 5 devices per group).
- **6-digit pairing codes** — Single-use codes (24-hour TTL, brute-force protected) to connect devices across different networks or when auto-discovery is unavailable.
- **Direct P2P transfer (≤ 500 MB per file, up to 1 GB per batch)** — Encrypted WebRTC DataChannels (DTLS) with 16 KiB chunking, per-chunk and streaming SHA-256 verification, explicit recipient approval, and resume after refresh via IndexedDB.
- **Automatic cloud link (> 500 MB up to 5 GB)** — Direct browser-to-Cloudflare R2 multipart upload (50 MiB parts, 4 parallel workers) using AWS Signature V4 presigned URLs. Zero file bytes pass through the application server. Links expire after 1 download or 6 hours.
- **Abuse & safety guards** — Executable/dangerous extension blocking (including double extensions like `.pdf.exe` and `.apk`), per-IP daily quotas (10 P2P files/day, 3 cloud links/day, reset at 00:00 WITA / UTC+8), per-tab session token protection, and WebSocket payload limits.
- **Bilingual UI** — Indonesian (default) and English.

---

## Architecture

```text
Browser A <═══ WebRTC DataChannel (P2P, DTLS, ≤ 500 MB) ═══> Browser B
   │                                                             │
   ├── WSS /ws (signaling, pairing, approval) ──> Node.js Server (Fastify + ws + SQLite)
   │
   └── HTTPS PUT/GET (presigned URLs, > 500 MB) ──> Cloudflare R2 (auto-delete after 1 download / 6h)
```

### Monorepo Layout

```text
Bagas-Share/
├── packages/
│   └── shared/          # Shared protocol types, limits, extension blocker, chunk codec
├── apps/
│   ├── server/          # Fastify + ws signaling server, SQLite quotas/pairing, R2 SigV4 signer
│   └── web/             # Svelte 5 + Vite SPA, WebRTC transfer engine, IndexedDB resume, i18n
├── deploy/              # Nginx, Caddy, and systemd templates
└── ecosystem.config.cjs # PM2 production process configuration
```

---

## Tech Stack

- **Frontend:** Svelte 5, Vite, TypeScript, self-hosted Plus Jakarta Sans (`@fontsource/plus-jakarta-sans`), `hash-wasm`
- **Backend:** Node.js 24 (`node:sqlite`, `node:crypto`), Fastify 5, `ws`
- **Transport & Storage:** Native browser WebRTC (`RTCPeerConnection`), IndexedDB (receiver resume), Cloudflare R2 (S3-compatible multipart presigned URLs)
- **Tooling:** pnpm workspaces, Vitest, GitHub Actions

---

## Local Development

### Prerequisites

- Node.js `>= 22.13` (tested on Node `24.x` with built-in `node:sqlite`)
- pnpm `9.x`

### Setup

```bash
git clone https://github.com/bagaskarakertayasa/bagasshare.git
cd bagasshare
pnpm install
```

### Run Locally

**Single-port mode (build + serve frontend & backend on port 3001):**

```bash
pnpm start:local
# Custom port:
pnpm start:local --port 8080
```

**Two-terminal dev mode (hot reload):**

```bash
# Terminal 1 — Signaling & API server (port 3001)
pnpm dev:server

# Terminal 2 — Vite dev server (port 5173, proxies /ws and /api to 3001)
pnpm dev:web
```

### Environment Variables

Create a `.env` file in the repository root to enable automatic > 500 MB link transfers via Cloudflare R2:

```env
PORT=3001
HOST=0.0.0.0
TRUST_PROXY=1
TZ=Asia/Makassar
DB_PATH=./data/state.sqlite

R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_BUCKET_NAME=bagas-share
```

> **Note:** When `R2_*` variables are omitted, local P2P transfers (≤ 500 MB) still work normally without Cloudflare R2.

### Cloudflare R2 Bucket Requirements

1. **CORS Policy** on your R2 bucket must allow `GET`, `PUT`, `HEAD` from your domain and expose `ETag`:
   ```json
   [
     {
       "AllowedOrigins": ["https://bagasshare.web.id"],
       "AllowedMethods": ["GET", "PUT", "HEAD"],
       "AllowedHeaders": ["*"],
       "ExposeHeaders": ["ETag", "etag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
2. **Object Lifecycle Rule** (recommended safety net): auto-delete uploaded objects and abort incomplete multipart uploads after 1 day.

---

## Testing & Build

```bash
# Build all workspace packages
pnpm -r build

# Run unit tests (shared + server)
pnpm -r test
```

---

## Production Deployment (VPS + Nginx + PM2)

Configuration templates are included in `deploy/` and `ecosystem.config.cjs`:

1. Build the monorepo (`pnpm install --frozen-lockfile && pnpm -r build`).
2. Start the signaling & API server with PM2 (`pm2 start ecosystem.config.cjs && pm2 save`) bound to `127.0.0.1:3001` (`--max-old-space-size=192`).
3. Configure Nginx with [deploy/nginx-bagas-share.conf](deploy/nginx-bagas-share.conf) (serves `apps/web/dist` and proxies `/ws` and `/api/` with `X-Real-IP`) and enable HTTPS with Certbot.

---

## License

MIT — Copyright © 2026 Bagaskara Kertayasa.
