<script lang="ts">
  import {
    LINK_PARALLEL_UPLOADS,
    validateLinkFile,
  } from '@bagas-share/shared';
  import { formatBytes } from '../lib/i18n/index.js';
  import { appState } from '../lib/state.svelte.js';

  let fileInput = $state<HTMLInputElement | null>(null);
  let titleEl = $state<HTMLHeadingElement | null>(null);
  let selectedFile = $state<File | null>(null);
  let fileError = $state<string>('');
  let uploading = $state(false);
  let uploadedBytes = $state(0);
  let shareUrl = $state<string>('');
  let copied = $state(false);

  $effect(() => {
    if (appState.linkDialogOpen && titleEl) {
      titleEl.focus();
    }
  });

  function resetDialogState() {
    selectedFile = null;
    fileError = '';
    uploading = false;
    uploadedBytes = 0;
    shareUrl = '';
    copied = false;
  }

  function handleClose() {
    if (uploading) return;
    resetDialogState();
    appState.closeLinkDialog();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && appState.linkDialogOpen && !uploading) {
      handleClose();
    }
  }

  function handleFilePicked(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;

    shareUrl = '';
    fileError = '';
    const check = validateLinkFile(
      { name: f.name, size: f.size },
      appState.linkQuotaRemaining
    );
    selectedFile = f;

    if (!check.valid) {
      if (check.reason === 'empty') {
        fileError = appState.t('issueEmpty');
      } else if (check.reason === 'too_large') {
        fileError = appState.t('linkErrTooLarge');
      } else if (check.reason === 'blocked_extension') {
        fileError = appState.t('issueBlockedExt', {
          ext: check.blockedExtension || '',
        });
      } else if (check.reason === 'quota_exceeded') {
        fileError = appState.t('linkErrQuota');
      }
    }
  }

  function uploadSinglePart(
    url: string,
    slice: Blob,
    onProgress: (loaded: number) => void
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url, true);
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) {
          onProgress(ev.loaded);
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const etag =
            xhr.getResponseHeader('ETag') ||
            xhr.getResponseHeader('etag') ||
            '';
          if (!etag) {
            reject(new Error('Missing ETag header from R2 CORS'));
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

  async function startUpload() {
    if (!selectedFile || fileError || uploading) return;
    uploading = true;
    uploadedBytes = 0;
    fileError = '';

    try {
      const initRes = await fetch('/api/links/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: selectedFile.name,
          fileSize: selectedFile.size,
          mimeType: selectedFile.type || 'application/octet-stream',
        }),
      });

      if (!initRes.ok) {
        const errData = (await initRes.json().catch(() => ({}))) as {
          error?: string;
        };
        if (errData.error === 'r2_not_configured') {
          fileError = appState.t('linkErrNotConfigured');
        } else if (errData.error === 'quota_exceeded') {
          fileError = appState.t('linkErrQuota');
        } else {
          fileError = appState.t('linkErrUploadFailed');
        }
        uploading = false;
        return;
      }

      const initData = (await initRes.json()) as {
        linkId: string;
        chunkSize: number;
        partUrls: Array<{ partNumber: number; url: string }>;
      };

      const file = selectedFile;
      const partProgress = new Map<number, number>();
      const completedParts: Array<{ partNumber: number; etag: string }> = [];
      const queue = [...initData.partUrls];

      const updateTotalUploaded = () => {
        let sum = 0;
        for (const v of partProgress.values()) sum += v;
        uploadedBytes = Math.min(file.size, sum);
      };

      const workers = Array.from(
        { length: Math.min(LINK_PARALLEL_UPLOADS, queue.length) },
        async () => {
          while (queue.length > 0) {
            const item = queue.shift();
            if (!item) break;
            const start = (item.partNumber - 1) * initData.chunkSize;
            const end = Math.min(file.size, start + initData.chunkSize);
            const slice = file.slice(start, end);

            const etag = await uploadSinglePart(item.url, slice, (loaded) => {
              partProgress.set(item.partNumber, loaded);
              updateTotalUploaded();
            });
            partProgress.set(item.partNumber, slice.size);
            updateTotalUploaded();
            completedParts.push({ partNumber: item.partNumber, etag });
          }
        }
      );

      await Promise.all(workers);

      const compRes = await fetch(`/api/links/${initData.linkId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parts: completedParts }),
      });

      if (!compRes.ok) {
        throw new Error('Complete failed');
      }

      const compData = (await compRes.json()) as {
        linkId: string;
        quotaRemaining: number;
      };
      appState.linkQuotaRemaining = compData.quotaRemaining;
      shareUrl = `${window.location.origin}/d/${compData.linkId}`;
    } catch {
      fileError = appState.t('linkErrUploadFailed');
    } finally {
      uploading = false;
    }
  }

  async function copyShareUrl() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      copied = true;
      setTimeout(() => {
        copied = false;
      }, 2_000);
    } catch {
      // abaikan
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if appState.linkDialogOpen}
  {@const pct =
    selectedFile && selectedFile.size > 0
      ? Math.min(100, Math.round((uploadedBytes / selectedFile.size) * 100))
      : 0}
  <div class="dialog-backdrop">
    <div
      class="dialog-box"
      role="dialog"
      aria-modal="true"
      aria-labelledby="link-dialog-title"
    >
      <div class="dialog-header">
        <h2 id="link-dialog-title" bind:this={titleEl} tabindex="-1">
          {appState.t('linkDialogTitle')}
        </h2>
        <button
          type="button"
          class="btn btn-secondary"
          disabled={uploading}
          onclick={handleClose}
        >
          {appState.t('dismissBtn')}
        </button>
      </div>

      <p class="rule-summary">{appState.t('linkRuleSummary')}</p>
      <p class="quota-note tabular">
        {appState.t('linkQuotaNote', { remaining: appState.linkQuotaRemaining })}
      </p>

      <input
        bind:this={fileInput}
        type="file"
        hidden
        class="sr-only"
        tabindex="-1"
        onchange={handleFilePicked}
      />

      {#if !shareUrl}
        <div class="picker-block">
          {#if selectedFile}
            <div class="selected-file-row">
              <span class="file-name">{selectedFile.name}</span>
              <span class="file-size tabular">
                {formatBytes(selectedFile.size, appState.locale)}
              </span>
            </div>
          {/if}

          <button
            type="button"
            class="btn btn-secondary"
            disabled={uploading || appState.linkQuotaRemaining <= 0}
            onclick={() => fileInput?.click()}
          >
            {selectedFile
              ? appState.t('linkChangeFileBtn')
              : appState.t('linkChooseFileBtn')}
          </button>
        </div>

        {#if uploading && selectedFile}
          <div class="upload-progress-block">
            <p class="progress-text tabular" aria-live="polite">
              {appState.t('linkUploadingStatus', {
                pct,
                sent: formatBytes(uploadedBytes, appState.locale),
                total: formatBytes(selectedFile.size, appState.locale),
              })}
            </p>
            <div
              class="progress-track"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div class="progress-fill" style="width: {pct}%;"></div>
            </div>
          </div>
        {/if}

        {#if fileError}
          <p class="error-text" role="alert">{fileError}</p>
        {/if}

        <div class="dialog-footer">
          <button
            type="button"
            class="btn btn-secondary"
            disabled={uploading}
            onclick={handleClose}
          >
            {appState.t('cancelBtn')}
          </button>
          <button
            type="button"
            class="btn btn-primary"
            disabled={!selectedFile || Boolean(fileError) || uploading}
            onclick={startUpload}
          >
            {appState.t('linkUploadBtn')}
          </button>
        </div>
      {:else}
        <div class="ready-block">
          <p class="ready-label">{appState.t('linkReadyLabel')}</p>
          <div class="url-row">
            <input type="text" readonly value={shareUrl} class="url-input" />
            <button
              type="button"
              class="btn btn-primary"
              onclick={copyShareUrl}
            >
              {copied
                ? appState.t('linkCopiedBtn')
                : appState.t('linkCopyBtn')}
            </button>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: var(--space-3);
  }

  h2 {
    margin: 0;
    font-size: 20px;
    line-height: 28px;
    font-weight: 600;
  }

  .rule-summary {
    margin: 0;
    font-size: 14px;
    line-height: 20px;
    color: var(--ink-muted);
  }

  .quota-note {
    margin: var(--space-2) 0 var(--space-4) 0;
    font-size: 14px;
    line-height: 20px;
    font-weight: 600;
    color: var(--ink);
  }

  .picker-block {
    padding: var(--space-4);
    background-color: var(--surface-sunken);
    border-radius: var(--radius-sm);
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-3);
  }

  .selected-file-row {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .file-name {
    font-size: 16px;
    line-height: 24px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-size {
    font-size: 12px;
    line-height: 16px;
    color: var(--ink-muted);
    flex-shrink: 0;
  }

  .upload-progress-block {
    margin-top: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .progress-text {
    margin: 0;
    font-size: 14px;
    line-height: 20px;
    font-weight: 600;
  }

  .progress-track {
    height: 8px;
    background-color: var(--surface-sunken);
    border-radius: var(--radius-full);
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background-color: var(--data);
    border-radius: var(--radius-full);
    transition: width var(--dur-fast) var(--ease-out);
  }

  .error-text {
    margin: var(--space-3) 0 0 0;
    font-size: 14px;
    line-height: 20px;
    color: var(--danger);
    font-weight: 600;
  }

  .ready-block {
    margin-top: var(--space-3);
    padding: var(--space-4);
    background-color: var(--surface-sunken);
    border-radius: var(--radius-sm);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .ready-label {
    margin: 0;
    font-size: 14px;
    line-height: 20px;
    font-weight: 600;
    color: var(--success);
  }

  .url-row {
    display: flex;
    gap: var(--space-2);
  }

  .url-input {
    flex: 1;
    min-height: 44px;
    padding: 0 var(--space-3);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-sm);
    background-color: var(--surface);
    font-size: 14px;
  }

  .dialog-footer {
    margin-top: var(--space-5);
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
  }
</style>
