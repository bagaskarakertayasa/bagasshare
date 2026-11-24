import { LINK_PARALLEL_UPLOADS } from '@bagas-share/shared';

export type CloudUploadErrorCode =
  | 'r2_not_configured'
  | 'quota_exceeded'
  | 'upload_failed';

export interface CloudUploadResult {
  ok: true;
  linkId: string;
  shareUrl: string;
  quotaRemaining?: number;
}

export interface CloudUploadFailure {
  ok: false;
  error: CloudUploadErrorCode;
}

function uploadSinglePartToR2(
  url: string,
  slice: Blob,
  onProgress: (loaded: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) onProgress(ev.loaded);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag =
          xhr.getResponseHeader('ETag') ||
          xhr.getResponseHeader('etag') ||
          '';
        if (!etag) {
          reject(new Error('Missing ETag header'));
          return;
        }
        resolve(etag);
      } else {
        reject(new Error(`HTTP ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(slice);
  });
}

export async function uploadFileToCloudflareR2(params: {
  file: File;
  isCancelled: () => boolean;
  onProgress: (bytesUploaded: number) => void;
}): Promise<CloudUploadResult | CloudUploadFailure | null> {
  const { file, isCancelled, onProgress } = params;

  try {
    const initRes = await fetch('/api/links/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || 'application/octet-stream',
      }),
    });

    if (!initRes.ok) {
      const errData = (await initRes.json().catch(() => ({}))) as {
        error?: string;
      };
      if (errData.error === 'r2_not_configured') {
        return { ok: false, error: 'r2_not_configured' };
      }
      if (errData.error === 'quota_exceeded') {
        return { ok: false, error: 'quota_exceeded' };
      }
      return { ok: false, error: 'upload_failed' };
    }

    const initData = (await initRes.json()) as {
      linkId: string;
      uploadSecret?: string;
      chunkSize: number;
      partUrls: Array<{ partNumber: number; url: string }>;
    };

    const partProgress = new Map<number, number>();
    const completedParts: Array<{ partNumber: number; etag: string }> = [];
    const queue = [...initData.partUrls];

    const emitProgress = () => {
      let sum = 0;
      for (const v of partProgress.values()) sum += v;
      onProgress(Math.min(file.size, sum));
    };

    const workers = Array.from(
      { length: Math.min(LINK_PARALLEL_UPLOADS, queue.length) },
      async () => {
        while (queue.length > 0 && !isCancelled()) {
          const part = queue.shift();
          if (!part) break;
          const start = (part.partNumber - 1) * initData.chunkSize;
          const end = Math.min(file.size, start + initData.chunkSize);
          const slice = file.slice(start, end);

          const etag = await uploadSinglePartToR2(part.url, slice, (loaded) => {
            partProgress.set(part.partNumber, loaded);
            emitProgress();
          });
          partProgress.set(part.partNumber, slice.size);
          emitProgress();
          completedParts.push({ partNumber: part.partNumber, etag });
        }
      }
    );

    await Promise.all(workers);
    if (isCancelled()) return null;

    const compRes = await fetch(`/api/links/${initData.linkId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uploadSecret: initData.uploadSecret,
        parts: completedParts,
      }),
    });

    if (!compRes.ok) {
      return { ok: false, error: 'upload_failed' };
    }

    const compData = (await compRes.json()) as {
      linkId: string;
      quotaRemaining?: number;
    };

    return {
      ok: true,
      linkId: initData.linkId,
      shareUrl: `${window.location.origin}/d/${initData.linkId}`,
      quotaRemaining: compData.quotaRemaining,
    };
  } catch {
    return { ok: false, error: 'upload_failed' };
  }
}
