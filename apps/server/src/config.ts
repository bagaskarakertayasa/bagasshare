import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import type { R2Config } from './r2.js';

export interface ServerConfig {
  port: number;
  host: string;
  trustProxy: boolean;
  dbPath: string;
  staticDir?: string;
  r2?: R2Config;
}

export function loadConfig(): ServerConfig {
  const defaultStaticDir = resolve(import.meta.dirname, '..', '..', 'web', 'dist');
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucketName = process.env.R2_BUCKET_NAME?.trim();

  const r2 =
    accountId && accessKeyId && secretAccessKey && bucketName
      ? { accountId, accessKeyId, secretAccessKey, bucketName }
      : undefined;

  return {
    port: Number(process.env.PORT || 3001),
    host: process.env.HOST || '0.0.0.0',
    trustProxy: process.env.TRUST_PROXY !== '0',
    dbPath: process.env.DB_PATH || resolve(process.cwd(), 'data', 'state.sqlite'),
    staticDir:
      process.env.STATIC_DIR ||
      (existsSync(defaultStaticDir) ? defaultStaticDir : undefined),
    r2,
  };
}
