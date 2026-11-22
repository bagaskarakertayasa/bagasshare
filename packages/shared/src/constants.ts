export const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024; // 500 MiB per file
export const MAX_TOTAL_SIZE_BYTES = 1024 * 1024 * 1024; // 1 GiB (PRD FR6.1)
export const CHUNK_SIZE_BYTES = 16 * 1024; // 16 KiB (TECH-DESIGN 7.2)
export const LOW_WATER_MARK_BYTES = 256 * 1024; // 256 KiB
export const HIGH_WATER_MARK_BYTES = 1024 * 1024; // 1 MiB
export const CHUNK_HEADER_BYTES = 40; // 4B fileIndex + 4B chunkIndex + 32B SHA-256

export const GROUP_MAX_DEVICES = 5; // PRD FR1.5
export const DAILY_FILE_QUOTA = 10; // PRD FR12.1
export const HEARTBEAT_INTERVAL_MS = 5_000; // PRD FR1.4
export const OFFLINE_TIMEOUT_MS = 15_000; // PRD FR1.4
export const TRANSFER_REQUEST_TIMEOUT_MS = 60_000; // PRD FR7.4
export const P2P_CONNECT_TIMEOUT_MS = 15_000; // PRD FR9.4
export const PAIRING_TTL_MS = 24 * 60 * 60 * 1000; // 24 jam (PRD FR3.2)
export const RESUME_TTL_MS = 24 * 60 * 60 * 1000; // 24 jam (PRD FR10.4)
export const PAIRING_MAX_FAILS_PER_HOUR = 10; // PRD FR3.4
export const PAIRING_BLOCK_WINDOW_MS = 60 * 60 * 1000; // 1 jam
export const SIGNALING_CONN_RATE_PER_MIN = 30; // PRD FR12.5
export const DATA_CHANNEL_NAME = 'bagas-share-v1';
export const QUOTA_TIMEZONE = 'Asia/Makassar'; // WITA UTC+8 (PRD FR12.4)

// Konstanta Fitur Berbagi Link 5 GB (Cloudflare R2)
export const LINK_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024 * 1024; // 5 GiB per link
export const LINK_DAILY_QUOTA_PER_IP = 3; // Maksimal 3 link / hari / IP
export const LINK_TTL_MS = 6 * 60 * 60 * 1000; // 6 jam (1x unduh atau 6 jam, mana yang lebih dulu)
export const LINK_MULTIPART_CHUNK_BYTES = 50 * 1024 * 1024; // 50 MiB per part (maks 100 part untuk 5 GiB)
export const LINK_PARALLEL_UPLOADS = 4; // 4 koneksi paralel saat upload ke R2

