import { createSHA256 } from 'hash-wasm';

/**
 * Menghitung SHA-256 (32 byte mentah) untuk satu chunk menggunakan SubtleCrypto
 * jika tersedia, atau fallback ke hash-wasm.
 */
export async function sha256ChunkBytes(data: Uint8Array): Promise<Uint8Array> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
    return new Uint8Array(digest);
  }
  const hasher = await createSHA256();
  hasher.init();
  hasher.update(data);
  return hasher.digest('binary');
}

export function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i]!.toString(16).padStart(2, '0');
  }
  return out;
}

export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Menghitung SHA-256 hex untuk seluruh File secara bertahap (streaming 4 MiB per langkah)
 * agar tidak memuat file 100 MB penuh ke memori (PRD FR9.5, TECH-DESIGN 2).
 */
export async function computeFileSha256Hex(file: Blob): Promise<string> {
  const hasher = await createSHA256();
  hasher.init();
  const sliceSize = 4 * 1024 * 1024;
  for (let offset = 0; offset < file.size; offset += sliceSize) {
    const buf = await file.slice(offset, offset + sliceSize).arrayBuffer();
    hasher.update(new Uint8Array(buf));
  }
  return hasher.digest('hex');
}
