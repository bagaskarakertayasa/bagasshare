import { describe, it, expect } from 'vitest';
import {
  getBlockedExtension,
  isBlockedFilename,
  sanitizeFilename,
  validateTransferFiles,
  encodeChunkFrame,
  decodeChunkFrame,
  MAX_FILE_SIZE_BYTES,
  MAX_TOTAL_SIZE_BYTES,
} from './index.js';

describe('blocked-ext', () => {
  it('memblokir ekstensi berbahaya termasuk huruf besar dan .apk', () => {
    expect(isBlockedFilename('setup.exe')).toBe(true);
    expect(isBlockedFilename('GAME.APK')).toBe(true);
    expect(isBlockedFilename('script.ps1')).toBe(true);
    expect(getBlockedExtension('installer.msi')).toBe('.msi');
  });

  it('memblokir ekstensi ganda seperti laporan.pdf.exe', () => {
    expect(getBlockedExtension('laporan.pdf.exe')).toBe('.exe');
    expect(getBlockedExtension('tagihan.exe.pdf')).toBe('.exe');
    expect(getBlockedExtension('aman.pdf')).toBeNull();
    expect(getBlockedExtension('foto.liburan.jpg')).toBeNull();
  });

  it('membersihkan karakter berbahaya pada nama file', () => {
    expect(sanitizeFilename('../rahasia/laporan:1?.pdf')).toBe('__rahasia_laporan_1_.pdf');
  });
});

describe('validateTransferFiles', () => {
  it('menolak file 0 byte, > 500 MB, total > 1 GB, dan kuota kurang', () => {
    const r1 = validateTransferFiles([{ fileId: '1', name: 'a.txt', size: 0 }], 5);
    expect(r1.valid).toBe(false);
    expect(r1.fileIssues[0]?.reason).toBe('empty');

    const r2 = validateTransferFiles(
      [{ fileId: '1', name: 'besar.zip', size: MAX_FILE_SIZE_BYTES + 1 }],
      5
    );
    expect(r2.valid).toBe(false);
    expect(r2.fileIssues[0]?.reason).toBe('too_large');

    const eleven = Array.from({ length: 11 }, (_, i) => ({
      fileId: String(i),
      name: `f${i}.pdf`,
      size: 100 * 1024 * 1024,
    }));
    const r3 = validateTransferFiles(eleven, 20);
    expect(r3.exceedsTotalLimit).toBe(true);
    expect(r3.totalSizeBytes).toBeGreaterThan(MAX_TOTAL_SIZE_BYTES);

    const r4 = validateTransferFiles(
      [
        { fileId: '1', name: 'a.pdf', size: 1024 },
        { fileId: '2', name: 'b.pdf', size: 1024 },
      ],
      1
    );
    expect(r4.exceedsQuota).toBe(true);
    expect(r4.valid).toBe(false);
  });
});

describe('chunk frame codec', () => {
  it('mengemas dan membuka header 40 byte + payload dengan benar', () => {
    const sha = new Uint8Array(32).fill(0xab);
    const payload = new Uint8Array([1, 2, 3, 4, 5]);
    const buf = encodeChunkFrame(2, 19, sha, payload);
    const dec = decodeChunkFrame(buf);
    expect(dec.fileIndex).toBe(2);
    expect(dec.chunkIndex).toBe(19);
    expect([...dec.sha256Bytes]).toEqual([...sha]);
    expect([...dec.payload]).toEqual([1, 2, 3, 4, 5]);
  });
});
