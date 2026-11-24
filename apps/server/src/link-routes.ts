import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  LINK_MULTIPART_CHUNK_BYTES,
  sanitizeFilename,
  validateLinkFile,
} from '@bagas-share/shared';
import { extractClientIp } from './ip-group.js';
import type { StateDatabase } from './db.js';
import {
  createR2PresignedUrl,
  r2CompleteMultipartUpload,
  r2CreateMultipartUpload,
  r2DeleteObject,
  type R2Config,
} from './r2.js';

function generateShortLinkId(): string {
  return randomBytes(6).toString('base64url'); // 8 karakter URL-safe
}

const REST_RATE_LIMIT_PER_MIN = 30;
const REST_RATE_WINDOW_MS = 60_000;

export function registerLinkRoutes(
  app: FastifyInstance,
  db: StateDatabase,
  r2: R2Config | undefined,
  trustProxy: boolean
): void {
  const apiRate = new Map<string, { count: number; resetAt: number }>();

  function checkApiRate(ip: string, nowMs: number = Date.now()): boolean {
    if (apiRate.size > 1000) {
      for (const [k, v] of apiRate) {
        if (nowMs > v.resetAt) apiRate.delete(k);
      }
    }
    const entry = apiRate.get(ip);
    if (!entry || nowMs > entry.resetAt) {
      apiRate.set(ip, { count: 1, resetAt: nowMs + REST_RATE_WINDOW_MS });
      return true;
    }
    entry.count += 1;
    return entry.count <= REST_RATE_LIMIT_PER_MIN;
  }

  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/links')) return;
    const ip = extractClientIp(req.raw, trustProxy);
    if (!checkApiRate(ip)) {
      return reply.code(429).send({ error: 'rate_limited' });
    }
  });

  // 1. Cek status fitur Link & sisa kuota harian (3 link/hari/IP)
  app.get('/api/links/quota', async (req) => {
    const ip = extractClientIp(req.raw, trustProxy);
    const quota = db.getLinkQuotaStatus(ip);
    return {
      enabled: Boolean(r2),
      remaining: quota.remaining,
      resetAt: quota.resetAt,
    };
  });

  // 2. Inisiasi pembuatan link 5 GB & buat Presigned Multipart Upload URLs ke R2
  app.post<{
    Body: { fileName: string; fileSize: number; mimeType?: string };
  }>('/api/links/init', async (req, reply) => {
    if (!r2) {
      return reply.code(503).send({ error: 'r2_not_configured' });
    }
    const ip = extractClientIp(req.raw, trustProxy);
    const quota = db.getLinkQuotaStatus(ip);

    const fileName = String(req.body?.fileName || '').trim();
    const fileSize = Number(req.body?.fileSize || 0);
    const mimeType = String(req.body?.mimeType || 'application/octet-stream');

    const validation = validateLinkFile({ name: fileName, size: fileSize }, quota.remaining);
    if (!validation.valid) {
      return reply.code(400).send({
        error: validation.reason,
        blockedExtension: validation.blockedExtension,
      });
    }

    const linkId = generateShortLinkId();
    const safeName = sanitizeFilename(fileName);
    const objectKey = `links/${linkId}/${safeName}`;

    // F1: Reservasi kuota harian langsung saat /init agar request paralel tidak bisa melewati batas 3 link/hari
    db.incrementLinksCreated(ip);
    const uploadId = await r2CreateMultipartUpload(r2, objectKey, mimeType);
    const record = db.createSharedLinkRecord({
      linkId,
      objectKey,
      uploadId,
      fileName: safeName,
      fileSize,
      mimeType,
      senderIp: ip,
    });

    const totalParts = Math.ceil(fileSize / LINK_MULTIPART_CHUNK_BYTES);
    const partUrls: Array<{ partNumber: number; url: string }> = [];
    for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
      const url = createR2PresignedUrl({
        config: r2,
        method: 'PUT',
        objectKey,
        expiresInSec: 3600, // 1 jam untuk menyelesaikan upload
        queryParams: {
          partNumber: String(partNumber),
          uploadId,
        },
      });
      partUrls.push({ partNumber, url });
    }

    return {
      linkId,
      chunkSize: LINK_MULTIPART_CHUNK_BYTES,
      totalParts,
      partUrls,
      expiresAt: new Date(record.expiresAt).toISOString(),
    };
  });

  // 3. Selesaikan Multipart Upload setelah semua bagian ter-upload dari browser ke R2
  app.post<{
    Params: { linkId: string };
    Body: { parts: Array<{ partNumber: number; etag: string }> };
  }>('/api/links/:linkId/complete', async (req, reply) => {
    if (!r2) {
      return reply.code(503).send({ error: 'r2_not_configured' });
    }
    const record = db.getSharedLink(req.params.linkId);
    if (!record || record.status !== 'uploading') {
      return reply.code(404).send({ error: 'not_found' });
    }
    const parts = Array.isArray(req.body?.parts) ? req.body.parts : [];
    if (parts.length === 0) {
      return reply.code(400).send({ error: 'empty_parts' });
    }

    await r2CompleteMultipartUpload(r2, record.objectKey, record.uploadId, parts);
    db.markSharedLinkReady(record.linkId);
    const currentQuota = db.getLinkQuotaStatus(record.senderIp);

    return {
      ok: true,
      linkId: record.linkId,
      expiresAt: new Date(record.expiresAt).toISOString(),
      quotaRemaining: currentQuota.remaining,
    };
  });

  // 4. Ambil info file untuk halaman penerima `/d/:linkId`
  app.get<{ Params: { linkId: string } }>('/api/links/:linkId', async (req, reply) => {
    const record = db.getSharedLink(req.params.linkId);
    if (!record || record.status !== 'ready') {
      return reply.code(404).send({ error: 'not_found_or_deleted' });
    }
    if (Date.now() > record.expiresAt) {
      if (r2) await r2DeleteObject(r2, record.objectKey);
      db.markSharedLinkDeleted(record.linkId);
      return reply.code(410).send({ error: 'expired' });
    }
    return {
      linkId: record.linkId,
      fileName: record.fileName,
      fileSize: record.fileSize,
      mimeType: record.mimeType,
      expiresAt: new Date(record.expiresAt).toISOString(),
    };
  });

  // 5. Hasilkan Presigned Download URL R2 untuk penerima
  app.post<{ Params: { linkId: string } }>(
    '/api/links/:linkId/download',
    async (req, reply) => {
      if (!r2) {
        return reply.code(503).send({ error: 'r2_not_configured' });
      }
      const record = db.getSharedLink(req.params.linkId);
      if (!record || record.status !== 'ready') {
        return reply.code(404).send({ error: 'not_found_or_deleted' });
      }
      if (Date.now() > record.expiresAt) {
        await r2DeleteObject(r2, record.objectKey);
        db.markSharedLinkDeleted(record.linkId);
        return reply.code(410).send({ error: 'expired' });
      }

      const downloadUrl = createR2PresignedUrl({
        config: r2,
        method: 'GET',
        objectKey: record.objectKey,
        expiresInSec: 3600,
        queryParams: {
          'response-content-disposition': `attachment; filename="${record.fileName.replace(/"/g, '')}"`,
        },
      });

      return { downloadUrl, fileName: record.fileName };
    }
  );

  // 6. Hapus file dari R2 segera setelah penerima selesai mengunduh (Keputusan 1A: 1x unduh langsung hapus)
  app.post<{ Params: { linkId: string } }>(
    '/api/links/:linkId/downloaded',
    async (req) => {
      const record = db.getSharedLink(req.params.linkId);
      if (record && record.status !== 'deleted') {
        if (r2) {
          await r2DeleteObject(r2, record.objectKey);
        }
        db.markSharedLinkDeleted(record.linkId);
      }
      return { ok: true };
    }
  );
}
