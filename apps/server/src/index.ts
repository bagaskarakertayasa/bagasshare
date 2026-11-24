import Fastify from 'fastify';
import { WebSocketServer } from 'ws';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { loadConfig, type ServerConfig } from './config.js';
import { StateDatabase } from './db.js';
import { GroupManager } from './group-manager.js';
import { TransferManager } from './transfer-manager.js';
import { SignalingHandler } from './ws-handler.js';
import { registerLinkRoutes } from './link-routes.js';
import { r2AbortMultipartUpload, r2DeleteObject } from './r2.js';

const MIME_MAP: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

export async function createServer(customConfig?: Partial<ServerConfig>) {
  const config: ServerConfig = { ...loadConfig(), ...customConfig };
  const db = new StateDatabase(config.dbPath);
  const groups = new GroupManager();
  const transfers = new TransferManager(groups, db);
  const handler = new SignalingHandler(db, groups, transfers, config.trustProxy);

  const app = Fastify({ logger: false });

  app.get('/healthz', async () => ({ status: 'ok' }));

  registerLinkRoutes(app, db, config.r2, config.trustProxy);

  if (config.staticDir && existsSync(config.staticDir)) {
    const root = config.staticDir;
    app.get('/*', async (req, reply) => {
      const urlPath = (req.url.split('?')[0] || '/').replace(/\.\./g, '');
      let filePath = join(root, urlPath === '/' ? 'index.html' : urlPath);
      if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
        filePath = join(root, 'index.html');
      }
      const ext = extname(filePath);
      reply.header('content-type', MIME_MAP[ext] || 'application/octet-stream');
      return reply.send(readFileSync(filePath));
    });
  }

  await app.ready();

  // F6: Batasi payload WebSocket 64 KiB (cukup untuk SDP/ICE & metadata, cegah OOM di 192 MB heap)
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  app.server.on('upgrade', (req, socket, head) => {
    const pathname = (req.url || '').split('?')[0];
    if (pathname === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        handler.handleConnection(ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  const pruneTimer = setInterval(() => {
    const removed = groups.pruneStaleDevices();
    for (const id of removed) {
      transfers.handleDeviceRemoved(id);
    }
  }, 3_000);

  const cleanupTimer = setInterval(async () => {
    handler.pruneRateLimits();
    const expiredLinks = db.getExpiredSharedLinks();
    for (const item of expiredLinks) {
      if (config.r2) {
        if (item.status === 'uploading') {
          await r2AbortMultipartUpload(config.r2, item.objectKey, item.uploadId);
        } else {
          await r2DeleteObject(config.r2, item.objectKey);
        }
      }
      db.markSharedLinkDeleted(item.linkId);
    }
    db.cleanupExpired();
  }, 10 * 60_000);

  const closeAll = async () => {
    clearInterval(pruneTimer);
    clearInterval(cleanupTimer);
    for (const client of wss.clients) {
      client.close();
    }
    await app.close();
    db.close();
  };

  return { app, db, groups, transfers, config, closeAll };
}

import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { app, config } = await createServer();
  await app.listen({ port: config.port, host: config.host });
  console.log(`Bagas Share signaling server berjalan di http://${config.host}:${config.port}`);
}
