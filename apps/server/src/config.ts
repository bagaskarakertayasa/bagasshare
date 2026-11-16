import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

export interface ServerConfig {
  port: number;
  host: string;
  trustProxy: boolean;
  dbPath: string;
  staticDir?: string;
}

export function loadConfig(): ServerConfig {
  const defaultStaticDir = resolve(import.meta.dirname, '..', '..', 'web', 'dist');
  return {
    port: Number(process.env.PORT || 3001),
    host: process.env.HOST || '0.0.0.0',
    trustProxy: process.env.TRUST_PROXY !== '0',
    dbPath: process.env.DB_PATH || resolve(process.cwd(), 'data', 'state.sqlite'),
    staticDir:
      process.env.STATIC_DIR ||
      (existsSync(defaultStaticDir) ? defaultStaticDir : undefined),
  };
}
