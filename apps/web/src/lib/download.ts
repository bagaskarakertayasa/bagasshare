import { sanitizeFilename } from '@bagas-share/shared';

export function triggerBrowserDownload(url: string, fileName: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = sanitizeFilename(fileName);
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Menyalin teks ke clipboard dengan fallback textarea + execCommand
 * agar tetap bekerja di Safari iOS maupun akses HTTP LAN lokal.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Lanjut ke fallback textarea
    }
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/**
 * Mengunduh file langsung dari Cloudflare R2 via Presigned URL lalu
 * menandai link sudah dipakai setelah unduhan dimulai (1x unduh langsung hapus).
 */
export async function downloadCloudLink(
  linkId: string,
  onMarkedDone?: () => void
): Promise<boolean> {
  const res = await fetch(
    `/api/links/${encodeURIComponent(linkId)}/download`,
    { method: 'POST' }
  );
  if (!res.ok) return false;

  const { downloadUrl, fileName } = (await res.json()) as {
    downloadUrl: string;
    fileName: string;
  };
  triggerBrowserDownload(downloadUrl, fileName);

  setTimeout(async () => {
    await fetch(`/api/links/${encodeURIComponent(linkId)}/downloaded`, {
      method: 'POST',
    }).catch(() => {});
    onMarkedDone?.();
  }, 4_000);

  return true;
}
