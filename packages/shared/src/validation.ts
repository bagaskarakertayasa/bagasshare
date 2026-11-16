import { CHUNK_HEADER_BYTES } from './constants.js';
import {
  MAX_FILE_SIZE_BYTES,
  MAX_TOTAL_SIZE_BYTES,
} from './constants.js';
import { getBlockedExtension } from './blocked-ext.js';
import type { TransferFileMeta } from './protocol.js';

export interface FileValidationIssue {
  fileId: string;
  name: string;
  reason: 'empty' | 'too_large' | 'blocked_extension';
  blockedExtension?: string;
}

export interface BatchValidationResult {
  valid: boolean;
  fileIssues: FileValidationIssue[];
  totalSizeBytes: number;
  exceedsTotalLimit: boolean;
  exceedsQuota: boolean;
}

/**
 * Validasi daftar file di client maupun server (PRD FR5.2, FR5.3, FR5.5, FR6.1, FR6.3).
 */
export function validateTransferFiles(
  files: ReadonlyArray<Pick<TransferFileMeta, 'fileId' | 'name' | 'size'>>,
  quotaRemaining: number
): BatchValidationResult {
  const fileIssues: FileValidationIssue[] = [];
  let totalSizeBytes = 0;

  for (const f of files) {
    totalSizeBytes += f.size;
    if (f.size <= 0) {
      fileIssues.push({ fileId: f.fileId, name: f.name, reason: 'empty' });
      continue;
    }
    if (f.size > MAX_FILE_SIZE_BYTES) {
      fileIssues.push({ fileId: f.fileId, name: f.name, reason: 'too_large' });
      continue;
    }
    const blocked = getBlockedExtension(f.name);
    if (blocked) {
      fileIssues.push({
        fileId: f.fileId,
        name: f.name,
        reason: 'blocked_extension',
        blockedExtension: blocked,
      });
    }
  }

  const exceedsTotalLimit = totalSizeBytes > MAX_TOTAL_SIZE_BYTES;
  const exceedsQuota = files.length > quotaRemaining;

  return {
    valid:
      files.length > 0 &&
      fileIssues.length === 0 &&
      !exceedsTotalLimit &&
      !exceedsQuota,
    fileIssues,
    totalSizeBytes,
    exceedsTotalLimit,
    exceedsQuota,
  };
}

/**
 * Kemas frame biner chunk 40-byte header + payload (TECH-DESIGN 7.2.B).
 */
export function encodeChunkFrame(
  fileIndex: number,
  chunkIndex: number,
  sha256Bytes: Uint8Array,
  payload: Uint8Array
): ArrayBuffer {
  if (sha256Bytes.byteLength !== 32) {
    throw new Error('SHA-256 harus 32 byte');
  }
  const buf = new ArrayBuffer(CHUNK_HEADER_BYTES + payload.byteLength);
  const view = new DataView(buf);
  view.setUint32(0, fileIndex, false);
  view.setUint32(4, chunkIndex, false);
  const out = new Uint8Array(buf);
  out.set(sha256Bytes, 8);
  out.set(payload, CHUNK_HEADER_BYTES);
  return buf;
}

export interface DecodedChunkFrame {
  fileIndex: number;
  chunkIndex: number;
  sha256Bytes: Uint8Array;
  payload: Uint8Array;
}

export function decodeChunkFrame(buf: ArrayBuffer): DecodedChunkFrame {
  if (buf.byteLength < CHUNK_HEADER_BYTES) {
    throw new Error('Frame chunk terlalu pendek');
  }
  const view = new DataView(buf);
  const fileIndex = view.getUint32(0, false);
  const chunkIndex = view.getUint32(4, false);
  const sha256Bytes = new Uint8Array(buf, 8, 32);
  const payload = new Uint8Array(buf, CHUNK_HEADER_BYTES);
  return { fileIndex, chunkIndex, sha256Bytes, payload };
}
