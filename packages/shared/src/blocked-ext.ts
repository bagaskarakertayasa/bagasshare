// Daftar ekstensi berbahaya yang diblokir (PRD FR5.3 + keputusan pemilik O5 untuk .apk)
export const BLOCKED_EXTENSIONS: readonly string[] = [
  '.exe',
  '.msi',
  '.bat',
  '.cmd',
  '.com',
  '.scr',
  '.pif',
  '.vbs',
  '.vbe',
  '.wsf',
  '.ps1',
  '.lnk',
  '.reg',
  '.hta',
  '.cpl',
  '.jar',
  '.dll',
  '.apk',
] as const;

const BLOCKED_SET = new Set<string>(BLOCKED_EXTENSIONS);

/**
 * Memeriksa apakah nama file mengandung ekstensi berbahaya, termasuk ekstensi ganda
 * seperti `dokumen.pdf.exe` atau spasi/titik di ujung nama file (PRD FR5.3).
 * Mengembalikan ekstensi yang terblokir (mis. `.exe`), atau `null` jika aman.
 */
export function getBlockedExtension(fileName: string): string | null {
  const cleaned = fileName.trim().replace(/[. ]+$/, '').toLowerCase();
  if (!cleaned) return null;
  const parts = cleaned.split('.');
  if (parts.length < 2) return null;
  // Cek semua bagian setelah segmen pertama untuk menangkap ekstensi ganda (mis. laporan.pdf.exe atau payload.exe.txt jika .exe ada di segmen akhir/tengah)
  // Sesuai PRD FR5.3: cek ekstensi akhir dan segmen ekstensi ganda.
  for (let i = 1; i < parts.length; i++) {
    const ext = '.' + parts[i];
    if (BLOCKED_SET.has(ext)) {
      return ext;
    }
  }
  return null;
}

export function isBlockedFilename(fileName: string): boolean {
  return getBlockedExtension(fileName) !== null;
}

/**
 * Sanitasi nama file saat diunduh di penerima (PRD E24, FR11.2).
 */
export function sanitizeFilename(fileName: string): string {
  const cleaned = fileName
    .replace(/[\x00-\x1f\x80-\x9f/\\?%*:|"<>]/g, '_')
    .replace(/^\.+/, '_')
    .trim();
  return cleaned || 'file';
}
