import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import type { R2Config } from './r2.js';

function loadDotEnvIfPresent(): void {
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(import.meta.dirname, '..', '..', '..', '.env'),
  ];
  for (const envPath of candidates) {
    if (!existsSync(envPath)) continue;
    const content = readFileSync(envPath, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eqIdx = line.indexOf('=');
      if (eqIdx <= 0) continue;
      const key = line.slice(0, eqIdx).trim();
      let val = line.slice(eqIdx + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
    break;
  }
}

export interface ServerConfig {
  port: number;
  host: string;
  trustProxy: boolean;
  dbPath: string;
  staticDir?: string;
  r2?: R2Config;
}

export function normalizeR2AccountId(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let cleaned = raw.trim().toLowerCase();
  cleaned = cleaned.replace(/^https?:\/\//, '');
  cleaned = cleaned.split('/')[0] || '';
  cleaned = cleaned.replace(/\.r2\.cloudflarestorage\.com$/, '');
  cleaned = cleaned.replace(/\.eu$/, '').replace(/\.fedramp$/, '');
  return cleaned || undefined;
}

function parsePortFromArgs(): number | undefined {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if ((a === '--port' || a === '-p') && args[i + 1]) {
      const n = Number(args[i + 1]);
      if (Number.isFinite(n) && n > 0) return n;
    }
    if (a.startsWith('--port=')) {
      const n = Number(a.slice(7));
      if (Number.isFinite(n) && n > 0) return n;
    }
    if (/^\d{2,5}$/.test(a)) {
      const n = Number(a);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return undefined;
}

export function loadConfig(): ServerConfig {
  loadDotEnvIfPresent();
  const defaultStaticDir = resolve(import.meta.dirname, '..', '..', 'web', 'dist');
  const accountId = normalizeR2AccountId(process.env.R2_ACCOUNT_ID);
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucketName = process.env.R2_BUCKET_NAME?.trim();

  const r2 =
    accountId && accessKeyId && secretAccessKey && bucketName
      ? { accountId, accessKeyId, secretAccessKey, bucketName }
      : undefined;

  return {
    port: parsePortFromArgs() || Number(process.env.PORT || 3001),
    host: process.env.HOST || '0.0.0.0',
    trustProxy: process.env.TRUST_PROXY !== '0',
    dbPath: process.env.DB_PATH || resolve(process.cwd(), 'data', 'state.sqlite'),
    staticDir:
      process.env.STATIC_DIR ||
      (existsSync(defaultStaticDir) ? defaultStaticDir : undefined),
    r2,
  };
}
