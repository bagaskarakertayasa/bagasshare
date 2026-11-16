import { createRequire } from 'node:module';
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';
const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: typeof DatabaseSyncType };
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomInt, randomUUID } from 'node:crypto';
import {
  DAILY_FILE_QUOTA,
  PAIRING_TTL_MS,
  PAIRING_MAX_FAILS_PER_HOUR,
  PAIRING_BLOCK_WINDOW_MS,
} from '@bagas-share/shared';

/**
 * Mengembalikan tanggal YYYY-MM-DD dan ISO 8601 waktu reset 00:00 WITA berikutnya (UTC+8).
 */
export function getWitaDateAndNextReset(nowMs: number = Date.now()): {
  dateWita: string;
  nextResetIso: string;
} {
  const witaOffsetMs = 8 * 60 * 60 * 1000;
  const witaTime = new Date(nowMs + witaOffsetMs);
  const year = witaTime.getUTCFullYear();
  const month = String(witaTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(witaTime.getUTCDate()).padStart(2, '0');
  const dateWita = `${year}-${month}-${day}`;

  const nextMidnightWitaAsUtc = Date.UTC(
    witaTime.getUTCFullYear(),
    witaTime.getUTCMonth(),
    witaTime.getUTCDate() + 1,
    0,
    0,
    0,
    0
  );
  const nextResetUtcMs = nextMidnightWitaAsUtc - witaOffsetMs;
  return {
    dateWita,
    nextResetIso: new Date(nextResetUtcMs).toISOString(),
  };
}

export interface PairingRedeemResult {
  ok: boolean;
  reason?: 'invalid' | 'expired' | 'used' | 'rate_limited';
  retryAfterSec?: number;
  groupId?: string;
  pairToken?: string;
}

export class StateDatabase {
  private db: DatabaseSyncType;

  constructor(dbPath: string) {
    if (dbPath !== ':memory:') {
      mkdirSync(dirname(dbPath), { recursive: true });
    }
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;

      CREATE TABLE IF NOT EXISTS daily_quota (
        ip TEXT NOT NULL,
        date_wita TEXT NOT NULL,
        files_received INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (ip, date_wita)
      );

      CREATE TABLE IF NOT EXISTS pairing_codes (
        code TEXT PRIMARY KEY,
        group_id TEXT NOT NULL,
        creator_device_id TEXT NOT NULL,
        pair_token TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        used_by_device_id TEXT,
        used_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_pairing_expires ON pairing_codes(expires_at);

      CREATE TABLE IF NOT EXISTS pairing_attempts (
        ip TEXT PRIMARY KEY,
        fail_count INTEGER NOT NULL DEFAULT 0,
        window_start_at INTEGER NOT NULL,
        blocked_until INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS active_pair_tokens (
        pair_token TEXT PRIMARY KEY,
        group_id TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
    `);
  }

  getQuotaStatus(ip: string, nowMs: number = Date.now()): {
    remaining: number;
    resetAt: string;
  } {
    const { dateWita, nextResetIso } = getWitaDateAndNextReset(nowMs);
    const stmt = this.db.prepare(
      'SELECT files_received FROM daily_quota WHERE ip = ? AND date_wita = ?'
    );
    const row = stmt.get(ip, dateWita) as { files_received: number } | undefined;
    const used = row ? Number(row.files_received) : 0;
    return {
      remaining: Math.max(0, DAILY_FILE_QUOTA - used),
      resetAt: nextResetIso,
    };
  }

  incrementFilesReceived(
    ip: string,
    count: number,
    nowMs: number = Date.now()
  ): { remaining: number; resetAt: string } {
    const safeCount = Math.max(0, Math.floor(count));
    const { dateWita } = getWitaDateAndNextReset(nowMs);
    const stmt = this.db.prepare(`
      INSERT INTO daily_quota (ip, date_wita, files_received, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(ip, date_wita) DO UPDATE SET
        files_received = files_received + excluded.files_received,
        updated_at = excluded.updated_at
    `);
    stmt.run(ip, dateWita, safeCount, nowMs);
    return this.getQuotaStatus(ip, nowMs);
  }

  createPairingCode(
    groupId: string,
    creatorDeviceId: string,
    nowMs: number = Date.now()
  ): { code: string; expiresAt: string; pairToken: string } {
    const expiresAtMs = nowMs + PAIRING_TTL_MS;
    const pairToken = randomUUID();
    let code = '';
    const checkStmt = this.db.prepare('SELECT 1 FROM pairing_codes WHERE code = ?');
    for (let attempt = 0; attempt < 20; attempt++) {
      const candidate = String(randomInt(0, 1_000_000)).padStart(6, '0');
      if (!checkStmt.get(candidate)) {
        code = candidate;
        break;
      }
    }
    if (!code) {
      code = String(randomInt(100_000, 1_000_000));
    }

    this.db
      .prepare(
        `INSERT INTO pairing_codes (code, group_id, creator_device_id, pair_token, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(code, groupId, creatorDeviceId, pairToken, nowMs, expiresAtMs);

    this.db
      .prepare(
        `INSERT INTO active_pair_tokens (pair_token, group_id, expires_at)
         VALUES (?, ?, ?)`
      )
      .run(pairToken, groupId, expiresAtMs);

    return {
      code,
      expiresAt: new Date(expiresAtMs).toISOString(),
      pairToken,
    };
  }

  resolvePairToken(pairToken: string | undefined, nowMs: number = Date.now()): string | null {
    if (!pairToken) return null;
    const row = this.db
      .prepare('SELECT group_id, expires_at FROM active_pair_tokens WHERE pair_token = ?')
      .get(pairToken) as { group_id: string; expires_at: number } | undefined;
    if (!row || Number(row.expires_at) < nowMs) {
      return null;
    }
    return row.group_id;
  }

  redeemPairingCode(
    codeRaw: string,
    joinerDeviceId: string,
    clientIp: string,
    nowMs: number = Date.now()
  ): PairingRedeemResult {
    const attemptRow = this.db
      .prepare(
        'SELECT fail_count, window_start_at, blocked_until FROM pairing_attempts WHERE ip = ?'
      )
      .get(clientIp) as
      | { fail_count: number; window_start_at: number; blocked_until: number }
      | undefined;

    if (attemptRow && Number(attemptRow.blocked_until) > nowMs) {
      return {
        ok: false,
        reason: 'rate_limited',
        retryAfterSec: Math.ceil((Number(attemptRow.blocked_until) - nowMs) / 1000),
      };
    }

    const code = codeRaw.trim();
    if (!/^\d{6}$/.test(code)) {
      return this.recordFailureAndReturn(clientIp, 'invalid', attemptRow, nowMs);
    }

    const row = this.db
      .prepare(
        'SELECT code, group_id, expires_at, used_by_device_id FROM pairing_codes WHERE code = ?'
      )
      .get(code) as
      | {
          code: string;
          group_id: string;
          expires_at: number;
          used_by_device_id: string | null;
        }
      | undefined;

    if (!row) {
      return this.recordFailureAndReturn(clientIp, 'invalid', attemptRow, nowMs);
    }
    if (row.used_by_device_id) {
      return this.recordFailureAndReturn(clientIp, 'used', attemptRow, nowMs);
    }
    if (Number(row.expires_at) < nowMs) {
      return this.recordFailureAndReturn(clientIp, 'expired', attemptRow, nowMs);
    }

    const joinerPairToken = randomUUID();
    this.db
      .prepare('UPDATE pairing_codes SET used_by_device_id = ?, used_at = ? WHERE code = ?')
      .run(joinerDeviceId, nowMs, code);

    this.db
      .prepare(
        'INSERT INTO active_pair_tokens (pair_token, group_id, expires_at) VALUES (?, ?, ?)'
      )
      .run(joinerPairToken, row.group_id, Number(row.expires_at));

    return {
      ok: true,
      groupId: row.group_id,
      pairToken: joinerPairToken,
    };
  }

  private recordFailureAndReturn(
    clientIp: string,
    reason: 'invalid' | 'expired' | 'used',
    attemptRow:
      | { fail_count: number; window_start_at: number; blocked_until: number }
      | undefined,
    nowMs: number
  ): PairingRedeemResult {
    let failCount = 1;
    let windowStart = nowMs;
    if (attemptRow && nowMs - Number(attemptRow.window_start_at) < PAIRING_BLOCK_WINDOW_MS) {
      failCount = Number(attemptRow.fail_count) + 1;
      windowStart = Number(attemptRow.window_start_at);
    }
    const blockedUntil =
      failCount >= PAIRING_MAX_FAILS_PER_HOUR ? nowMs + PAIRING_BLOCK_WINDOW_MS : 0;

    this.db
      .prepare(
        `INSERT INTO pairing_attempts (ip, fail_count, window_start_at, blocked_until)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(ip) DO UPDATE SET
           fail_count = excluded.fail_count,
           window_start_at = excluded.window_start_at,
           blocked_until = excluded.blocked_until`
      )
      .run(clientIp, failCount, windowStart, blockedUntil);

    if (blockedUntil > nowMs) {
      return {
        ok: false,
        reason: 'rate_limited',
        retryAfterSec: Math.ceil((blockedUntil - nowMs) / 1000),
      };
    }
    return { ok: false, reason };
  }

  cleanupExpired(nowMs: number = Date.now()): void {
    const { dateWita } = getWitaDateAndNextReset(nowMs - 2 * 86_400_000);
    this.db.prepare('DELETE FROM daily_quota WHERE date_wita < ?').run(dateWita);
    this.db.prepare('DELETE FROM pairing_codes WHERE expires_at < ?').run(nowMs);
    this.db.prepare('DELETE FROM active_pair_tokens WHERE expires_at < ?').run(nowMs);
    this.db
      .prepare(
        'DELETE FROM pairing_attempts WHERE window_start_at < ? AND blocked_until < ?'
      )
      .run(nowMs - PAIRING_BLOCK_WINDOW_MS, nowMs);
  }

  close(): void {
    this.db.close();
  }
}
