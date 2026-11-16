# Technical Design — Bagas Share

Versi: 1.0 | Status: Complete | Tanggal: 2026-11-16
Acuan: [PRD.md](PRD.md) v1.3, [DESIGN-BRIEF.md](DESIGN-BRIEF.md) v1.0.
Uji kelayakan WebRTC (`spike/`) sudah selesai dan memvalidasi transfer P2P dengan chunk 16 KiB + antrean kandidat ICE + verifikasi SHA-256.

## 1. Prinsip

- Server hanya signaling; isi file tidak pernah melewati server (PRD FR9.1).
- Server ringan: target < 100 MB RAM untuk 5 device per grup (VPS 1 core / 1 GB RAM / 60 GB disk).
- Satu bahasa (TypeScript) di client dan server; tipe pesan dibagi bersama.
- Dependency seminimal mungkin; pakai API browser native bila ada.
- Wajib jalan di Chrome, Safari iOS, Firefox tanpa instalasi.

## 2. Stack

| Lapisan | Pilihan | Alasan |
|---|---|---|
| Bahasa | TypeScript | Tipe bersama client dan server |
| Struktur repo | pnpm monorepo: `apps/web`, `apps/server`, `packages/shared` | `shared` berisi tipe pesan, daftar ekstensi terlarang, konstanta batas |
| Signaling server | Node.js LTS + Fastify + `ws` | Ringan; WebSocket stabil |
| State server | In-memory (device, grup, request) | Data sementara; tidak perlu DB |
| Kuota harian + kode pairing | SQLite (`better-sqlite3`) | Bertahan setelah restart, tanpa servis tambahan |
| Rate limit | `@fastify/rate-limit` + penghitung kustom untuk percobaan pairing | Sudah tersedia |
| Frontend | Svelte 5 + Vite + TypeScript (SPA) | Bundle kecil, cepat di HP |
| Styling | Tailwind CSS | Responsif, cepat |
| i18n (ID default, EN) | Kamus JSON + Svelte store | Hanya 2 bahasa |
| WebRTC | API browser native (`RTCPeerConnection`, data channel) | Tanpa library tambahan |
| NAT traversal | STUN publik; tanpa TURN | Keputusan pemilik |
| Pengiriman data | Chunk 16 KiB + backpressure (`bufferedAmountLowThreshold`) | Batas aman lintas browser |
| Checksum | SHA-256 per chunk (`SubtleCrypto`); per file streaming (`hash-wasm`) | `SubtleCrypto` tidak mendukung hash bertahap |
| Penyimpanan resume (penerima) | IndexedDB | Paling kompatibel, termasuk Safari iOS |
| Nama device | `ua-parser-js` | Format "Chrome di Android" |
| Reverse proxy + HTTPS | Caddy (atau Nginx jika sertifikat manual) | WebSocket + HTTPS; meneruskan `X-Forwarded-For` |
| Proses di VPS | systemd (atau PM2) | Lebih ringan dari Docker pada 1 GB RAM |
| Test | Vitest (unit), Playwright (alur dua tab, Chromium) + uji manual di perangkat nyata | |
| CI | GitHub Actions | Repo open source (MIT) |

## 3. Keputusan Teknis

| # | Keputusan | Alasan |
|---|---|---|
| D1 | Grup jaringan dibentuk dari IP publik; untuk IPv6 dipakai prefix `/64` | Mengurangi kegagalan deteksi pada jaringan IPv6 (PRD E6) |
| D2 | Server hanya mempercayai `X-Forwarded-For` dari proxy lokal | Mencegah pemalsuan IP yang akan menghindari kuota atau masuk grup orang lain |
| D3 | Server Node.js, bukan Go/Rust | Hemat RAM Go/Rust tidak berarti untuk beban ini; tipe bersama lebih bernilai |
| D4 | `simple-peer` dan sejenisnya tidak dipakai | Tidak dirawat aktif; API native cukup |
| D5 | Chunk disimpan di IndexedDB, bukan OPFS | Kompatibilitas Safari iOS; OPFS ditinjau ulang bila performa kurang |
| D6 | Kuota harian di SQLite, reset 00:00 WITA (UTC+8) | PRD FR12.1, FR12.4 |
| D7 | Blokir ekstensi dilakukan di client pengirim, server, dan client penerima, memakai daftar dari `packages/shared` | PRD FR5.4 |
| D8 | Kandidat ICE yang tiba sebelum `remoteDescription` diantrekan di memori client | Ditemukan saat uji kelayakan (`spike/`): mencegah kegagalan jabat tangan WebRTC ketika kandidat tiba lebih dulu dari SDP |

## 4. Deployment

```
Browser ──HTTPS/WSS──> Caddy (VPS Biznetgio) ──> Node.js (Fastify + ws) ──> SQLite
Browser <══ WebRTC data channel (P2P, via STUN) ══> Browser
```

- Sertifikat HTTPS dan domain (`bagasshare.web.id`) sudah dimiliki pemilik; Caddy memakainya atau mengelola sendiri.
- Server dikonfigurasi dengan zona waktu `Asia/Makassar` untuk reset kuota.
- Server dijalankan sebagai servis systemd dengan restart otomatis.

## 5. Risiko Teknis dan Hal yang Belum Diverifikasi

| # | Item | Tindakan |
|---|---|---|
| T1 | Versi terbaru semua library belum dicek | Verifikasi saat inisialisasi proyek |
| T2 | WebRTC data channel, IndexedDB, dan perilaku background di Safari iOS (memori, layar mati) belum diverifikasi | Uji di iPhone nyata segera setelah kerangka monorepo berjalan (PRD R8) |
| T3 | Kecepatan transfer ≥ 10 MB/s (PRD bagian 9) bergantung pada wifi dan ukuran chunk/buffer | Chunk 16 KiB + `bufferedAmountLowThreshold = 256 KiB` dan `HIGH = 1 MiB` teruji stabil di spike |
| T4 | Resume setelah refresh bergantung pada pengirim memilih ulang file (PRD FR10.3) | Rancang UI pemandu; uji di semua browser target |
| T5 | Tanpa TURN, koneksi gagal pada NAT simetris/firewall ketat (PRD R10) | Diterima pemilik; pastikan pesan error jelas |

## 6. Urutan Pengerjaan

1. Uji kelayakan (selesai di `spike/`).
2. Inisialisasi monorepo + signaling dan deteksi grup, nama device, batas 5 device.
3. Persetujuan, transfer, progress, unduh.
4. Pairing, kuota, rate limit, blokir ekstensi.
5. Resume setelah refresh.
6. i18n, polish, deploy (target rilis 16 Desember 2026).

---

## 7. Spesifikasi Detail (Protokol, Modul, DB, Deployment)

### 7.1 Protokol dan Skema Pesan Signaling (WebSocket `/ws`)

Semua pesan WebSocket berbentuk JSON dengan field diskriminator `type`. Definisi TypeScript ditempatkan di `packages/shared/src/protocol.ts`.

#### A. Koneksi dan Identitas
Saat membuka koneksi WebSocket, client mengirim query `/ws?deviceId=<uuid>&pairToken=<optional_token>`:
- `deviceId`: UUID v4 yang disimpan di `localStorage` client (PRD FR1.6).
- `pairToken`: token sesi pairing yang disimpan di `sessionStorage` tab (PRD FR3.5) agar pairing bertahan saat refresh tetapi hilang saat tab ditutup.

#### B. Pesan Client → Server (`ClientMessage`)

```ts
export type ClientMessage =
  | { type: 'heartbeat' }
  | { type: 'pair:create' }
  | { type: 'pair:join'; code: string }
  | {
      type: 'transfer:request';
      targetDeviceId: string;
      resumeTransferId?: string;
      files: Array<{
        fileId: string;
        name: string;
        size: number;
        mimeType: string;
        sha256: string;
      }>;
    }
  | {
      type: 'transfer:respond';
      transferId: string;
      accept: boolean;
      reason?: 'rejected' | 'busy';
    }
  | { type: 'transfer:cancel'; transferId: string }
  | {
      type: 'rtc:signal';
      transferId: string;
      targetDeviceId: string;
      sdp?: RTCSessionDescriptionInit;
      ice?: RTCIceCandidateInit;
    }
  | {
      type: 'transfer:complete';
      transferId: string;
      filesReceived: number;
    };
```

#### C. Pesan Server → Client (`ServerMessage`)

```ts
export type DeviceKind = 'phone' | 'tablet' | 'laptop' | 'desktop' | 'unknown';

export interface PeerInfo {
  deviceId: string;
  displayName: string;
  kind: DeviceKind;
  colorSlot: 1 | 2 | 3 | 4;
  source: 'auto_ip' | 'pairing_code';
  busy: boolean;
}

export type ServerMessage =
  | {
      type: 'welcome';
      deviceId: string;
      displayName: string;
      kind: DeviceKind;
      groupId: string;
      quotaRemaining: number;
      quotaResetAt: string; // ISO 8601 (00:00 WITA berikutnya)
    }
  | { type: 'group:full' }
  | { type: 'peers:update'; peers: PeerInfo[] }
  | {
      type: 'pair:created';
      code: string;        // 6 digit angka
      expiresAt: string;   // +24 jam
      pairToken: string;   // disimpan di sessionStorage pembuat
    }
  | {
      type: 'pair:joined';
      groupId: string;
      pairToken: string;   // disimpan di sessionStorage pemasuk
    }
  | {
      type: 'pair:error';
      reason: 'invalid' | 'expired' | 'used' | 'rate_limited' | 'group_full';
      retryAfterSec?: number;
    }
  | {
      type: 'transfer:Created';
      transferId: string;
      expiresAt: string;   // +60 detik untuk persetujuan
    }
  | {
      type: 'transfer:incoming';
      transferId: string;
      from: PeerInfo;
      expiresAt: string;
      isResume: boolean;
      files: Array<{
        fileId: string;
        name: string;
        size: number;
        mimeType: string;
        sha256: string;
      }>;
    }
  | {
      type: 'transfer:status';
      transferId: string;
      status:
        | 'accepted'
        | 'rejected'
        | 'expired'
        | 'busy'
        | 'cancelled'
        | 'completed'
        | 'quota_exceeded'
        | 'invalid_files';
      message?: string;
    }
  | {
      type: 'rtc:signal';
      transferId: string;
      fromDeviceId: string;
      sdp?: RTCSessionDescriptionInit;
      ice?: RTCIceCandidateInit;
    }
  | {
      type: 'quota:update';
      quotaRemaining: number;
      quotaResetAt: string;
    };
```

#### D. Validasi di Server Saat `transfer:request`
Sebelum meneruskan `transfer:incoming` ke penerima, server wajib memeriksa:
1. Pengirim dan penerima berada di grup yang sama dan online.
2. Penerima tidak sedang menangani permintaan/transfer aktif (`busy === false`, PRD FR7.5).
3. Jumlah file ≥ 1, tiap file > 0 byte dan ≤ `100 * 1024 * 1024` byte (100 MiB), total seluruh file ≤ `1024 * 1024 * 1024` byte (1 GiB).
4. Tidak ada file dengan ekstensi terlarang (PRD FR5.3–5.4, termasuk pemeriksaan ekstensi ganda).
5. `quotaRemaining` IP pengirim ≥ `files.length` (PRD FR6.3, FR12.1).
6. Bila semua lolos, server membuat `transferId`, menyetel timer 60 detik (PRD FR7.4), menandai penerima `busy = true`, dan mengirim `transfer:incoming`.

---

### 7.2 Format Chunk DataChannel dan Protokol Resume

#### A. Konfigurasi WebRTC DataChannel
- Nama channel: `bagas-share-v1`
- `ordered: true` (menjamin urutan chunk)
- `binaryType = 'arraybuffer'`
- `CHUNK_SIZE = 16_384` (16 KiB)
- `LOW_WATER_MARK = 262_144` (256 KiB, `bufferedAmountLowThreshold`)
- `HIGH_WATER_MARK = 1_048_576` (1 MiB)
- Timeout pembentukan koneksi P2P setelah Terima: **15 detik** (PRD FR9.4).

#### B. Pesan di Dalam DataChannel
DataChannel mengirim dua jenis frame:
1. **Frame kontrol (string JSON):**
   ```ts
   export type DcControlMessage =
     | {
         type: 'file:resume-info'; // dikirim penerima ke pengirim saat channel terbuka
         files: Record<string, { nextChunkIndex: number }>; // key = sha256 file
       }
     | {
         type: 'file:start';
         fileId: string;
         sha256: string;
         name: string;
         size: number;
         totalChunks: number;
         startChunkIndex: number;
       }
     | {
         type: 'file:end';
         fileId: string;
         sha256: string;
       }
     | {
         type: 'file:verified';
         fileId: string;
         ok: boolean;
       }
     | {
         type: 'transfer:done';
       };
   ```
2. **Frame biner (`ArrayBuffer`) untuk tiap chunk:**
   Setiap frame biner berukuran maksimal `40 + 16_384 = 16_424` byte dengan header tetap 40 byte:
   | Offset (byte) | Panjang | Tipe | Isi |
   |---|---|---|---|
   | `0..3` | 4 | `Uint32BE` | `fileIndex` (urutan file dalam transfer, 0..N-1) |
   | `4..7` | 4 | `Uint32BE` | `chunkIndex` (0..totalChunks-1) |
   | `8..39` | 32 | `Uint8Array` | SHA-256 mentah (32 byte) dari payload chunk |
   | `40..akhir` | ≤ 16384 | `Uint8Array` | Payload chunk |

   *Alasan header biner 40 byte:* tidak ada overhead base64, mudah di-parse dengan `DataView`, dan langsung memuat checksum SHA-256 per chunk (PRD FR9.3).

#### C. Penyimpanan IndexedDB di Penerima & Alur Resume (PRD F10)
Database IndexedDB: `bagas-share-db` (versi 1), terdiri dari dua object store:
1. `transfers`:
   - Key: `fileSha256` (string)
   - Value: `{ transferId, fileId, fileName, fileSize, mimeType, fileSha256, totalChunks, lastChunkIndex, senderDeviceId, updatedAt, expiresAt }`
   - `expiresAt = updatedAt + 24 jam` (PRD FR10.4). Saat aplikasi dibuka, semua entri dengan `expiresAt < Date.now()` dihapus beserta chunk-nya.
2. `chunks`:
   - Key: `[fileSha256, chunkIndex]`
   - Value: `{ fileSha256, chunkIndex, data: ArrayBuffer }`
   - Supaya penulisan ke IndexedDB tidak memperlambat DataChannel (terutama di Safari iOS), penerima menulis ke IndexedDB secara **batch setiap 32 chunk (512 KiB)** dalam satu transaksi `readwrite`, dan memperbarui `lastChunkIndex` setelah transaksi commit.

**Alur Resume:**
1. **Putus singkat tanpa refresh:** begitu WebSocket tersambung kembali dan kedua `deviceId` masih ada di grup yang sama, pengirim otomatis membuat koneksi WebRTC ulang untuk `transferId` yang sama. Penerima mengirim `file:resume-info` berisi `nextChunkIndex = lastChunkIndex + 1`, dan pengirim melanjutkan dari `nextChunkIndex` tanpa dialog persetujuan ulang.
2. **Putus karena refresh halaman (PRD FR10.3):**
   - Pengirim menyimpan metadata transfer yang belum selesai di `sessionStorage` (`pendingResume`).
   - Saat halaman dimuat ulang, UI menampilkan banner S6: *"Ada transfer yang terputus. Pilih file yang sama untuk melanjutkan."*
   - Ketika pengirim memilih file, client menghitung SHA-256 streaming (`hash-wasm`) dan mencocokkannya dengan `fileSha256` pada `pendingResume`.
   - Jika cocok, client mengirim `transfer:request` dengan `resumeTransferId`. Penerima yang memiliki data parsial untuk `fileSha256` tersebut langsung melanjutkan dari `lastChunkIndex + 1`.
   - Jika tidak cocok, tampilkan error E14 dan tawarkan mulai baru dengan persetujuan baru.

---

### 7.3 Struktur Modul Monorepo

```
Bagas-Share/
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── packages/
│   └── shared/
│       ├── package.json
│       └── src/
│           ├── index.ts
│           ├── constants.ts        # MAX_FILE_SIZE (100 MiB), MAX_TOTAL_SIZE (1 GiB), CHUNK_SIZE (16 KiB), DAILY_QUOTA (10), GROUP_LIMIT (5)
│           ├── blocked-ext.ts      # Daftar ekstensi terlarang + fungsi isBlockedFilename() (cek ekstensi ganda)
│           └── protocol.ts         # Tipe ClientMessage, ServerMessage, DcControlMessage, PeerInfo
├── apps/
│   ├── server/
│   │   ├── package.json
│   │   └── src/
│   │       ├── index.ts            # Bootstrap Fastify + WebSocket + jadwal cleanup
│   │       ├── config.ts           # PORT, TRUST_PROXY, DB_PATH, TZ=Asia/Makassar
│   │       ├── ip-group.ts         # Normalisasi IPv4 & IPv6 /64 (D1, D2)
│   │       ├── ua-name.ts          # Parser User-Agent -> "{Browser} di {OS}" + kind + penomoran kembar
│   │       ├── db.ts               # Koneksi better-sqlite3 + query kuota, pairing, rate-limit
│   │       ├── group-manager.ts    # State in-memory: Device, Group, batas 5 device, slot warna 1..4, heartbeat 15 dtk
│   │       ├── transfer-manager.ts # State in-memory: TransferRequest, timeout 60 dtk, status busy
│   │       └── ws-handler.ts       # Router pesan ClientMessage & validasi server
│   └── web/
│       ├── package.json
│       ├── index.html
│       ├── vite.config.ts
│       └── src/
│           ├── main.ts
│           ├── app.css             # Design tokens dari DESIGN-BRIEF.md + @font-face Plus Jakarta Sans
│           ├── App.svelte          # Satu layar kerja (S1..S11)
│           ├── lib/
│           │   ├── i18n/           # id.json, en.json, store bahasa
│           │   ├── signaling.ts    # WebSocket client + auto-reconnect + heartbeat 5 dtk
│           │   ├── webrtc.ts       # RTCPeerConnection + antrean ICE + DataChannel chunking 16 KiB
│           │   ├── hash.ts         # SHA-256 file (hash-wasm streaming) & chunk (SubtleCrypto)
│           │   ├── idb-resume.ts   # IndexedDB store untuk chunk parsial & cleanup 24 jam
│           │   └── state.svelte.ts # State reaktif Svelte 5 (peers, transfers, quota, dialogs, toasts)
│           └── components/
│               ├── AppBar.svelte
│               ├── DeviceTile.svelte
│               ├── DeviceSilhouette.svelte
│               ├── ComposerDialog.svelte
│               ├── IncomingDialog.svelte
│               ├── TransferPanel.svelte
│               ├── PairingDialog.svelte
│               ├── SystemBanner.svelte
│               └── Toast.svelte
└── deploy/
    ├── Caddyfile
    └── bagas-share.service
```

---

### 7.4 Skema SQLite (`apps/server/src/db.ts`)

File database: `/var/lib/bagas-share/state.sqlite` (atau `./data/state.sqlite` saat pengembangan), dijalankan dengan `PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;`.

```sql
-- 1. Kuota harian per IP (PRD FR12.1: maks 10 file/hari, reset 00:00 WITA)
CREATE TABLE IF NOT EXISTS daily_quota (
  ip TEXT NOT NULL,
  date_wita TEXT NOT NULL,          -- Format 'YYYY-MM-DD' dalam zona Asia/Makassar (UTC+8)
  files_received INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,      -- Unix timestamp (ms)
  PRIMARY KEY (ip, date_wita)
);

-- 2. Kode pairing 6 digit (PRD FR3.1-3.2: berlaku 24 jam, sekali pakai)
CREATE TABLE IF NOT EXISTS pairing_codes (
  code TEXT PRIMARY KEY,            -- 6 digit angka ('000000'..'999999')
  group_id TEXT NOT NULL,
  creator_device_id TEXT NOT NULL,
  pair_token TEXT NOT NULL,
  created_at INTEGER NOT NULL,      -- Unix timestamp (ms)
  expires_at INTEGER NOT NULL,      -- created_at + 86_400_000 (24 jam)
  used_by_device_id TEXT,           -- NULL jika belum dipakai
  used_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_pairing_expires ON pairing_codes(expires_at);

-- 3. Pembatas percobaan salah kode pairing (PRD FR3.4: maks 10 gagal / IP / jam)
CREATE TABLE IF NOT EXISTS pairing_attempts (
  ip TEXT PRIMARY KEY,
  fail_count INTEGER NOT NULL DEFAULT 0,
  window_start_at INTEGER NOT NULL, -- Unix timestamp (ms)
  blocked_until INTEGER NOT NULL DEFAULT 0
);
```

**Jadwal Pembersihan Otomatis (Interval setiap 10 menit di Server):**
- Hapus baris `daily_quota` yang `date_wita` lebih lama dari 2 hari.
- Hapus baris `pairing_codes` yang `expires_at < Date.now()`.
- Hapus baris `pairing_attempts` yang `window_start_at < Date.now() - 3_600_000` dan `blocked_until < Date.now()`.

---

### 7.5 Konfigurasi Caddy dan systemd

#### A. `deploy/Caddyfile`
Caddy mengurus HTTPS, melayani file statis frontend (`apps/web/dist`), dan meneruskan `/ws` ke server Fastify lokal di port `3001`. Caddy secara default menimpa `X-Forwarded-For` dengan IP koneksi asli sehingga aman untuk dipadukan dengan `TRUST_PROXY=1` di Node.js.

```caddyfile
bagasshare.web.id {
    encode zstd gzip

    @ws {
        path /ws*
    }
    reverse_proxy @ws 127.0.0.1:3001 {
        header_up X-Real-IP {remote_host}
    }

    root * /srv/bagas-share/apps/web/dist
    try_files {path} /index.html
    file_server

    header {
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "no-referrer"
        Permissions-Policy "camera=(), microphone=(), geolocation=()"
    }
}
```

#### B. `deploy/bagas-share.service` (systemd)

```ini
[Unit]
Description=Bagas Share Signaling Server
After=network.target

[Service]
Type=simple
User=bagasshare
Group=bagasshare
WorkingDirectory=/srv/bagas-share/apps/server
Environment=NODE_ENV=production
Environment=PORT=3001
Environment=HOST=127.0.0.1
Environment=TRUST_PROXY=1
Environment=TZ=Asia/Makassar
Environment=DB_PATH=/var/lib/bagas-share/state.sqlite
ExecStart=/usr/bin/node --max-old-space-size=256 dist/index.js
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/var/lib/bagas-share

[Install]
WantedBy=multi-user.target
```

*Catatan kapasitas:* `--max-old-space-size=256` membatasi heap V8 maksimal 256 MB sehingga sangat aman di VPS 1 GB RAM bersama OS, Caddy, dan SQLite.
