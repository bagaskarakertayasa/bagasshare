<script lang="ts">
  import { onMount } from 'svelte';
  import { formatBytes, formatWitaDateTime } from '../lib/i18n/index.js';
  import { downloadCloudLink } from '../lib/download.js';
  import { appState } from '../lib/state.svelte.js';

  let { linkId }: { linkId: string } = $props();

  let status = $state<'loading' | 'ready' | 'downloading' | 'done' | 'expired'>('loading');
  let meta = $state<{
    fileName: string;
    fileSize: number;
    expiresAt: string;
  } | null>(null);

  onMount(async () => {
    try {
      const res = await fetch(`/api/links/${encodeURIComponent(linkId)}`);
      if (!res.ok) {
        status = 'expired';
        return;
      }
      meta = (await res.json()) as {
        fileName: string;
        fileSize: number;
        expiresAt: string;
      };
      status = 'ready';
    } catch {
      status = 'expired';
    }
  });

  async function handleDownload() {
    if (!meta || status !== 'ready') return;
    status = 'downloading';

    try {
      const ok = await downloadCloudLink(linkId, () => {
        status = 'done';
      });
      if (!ok) {
        status = 'expired';
      }
    } catch {
      status = 'expired';
    }
  }
</script>

<main class="canvas download-container">
  {#if status === 'loading'}
    <p class="subtitle">{appState.t('downloadLoading')}</p>
  {:else if status === 'expired' || !meta}
    <h1 class="h1">{appState.t('downloadExpiredTitle')}</h1>
    <p class="subtitle">{appState.t('downloadExpiredBody')}</p>
    <div style="margin-top: var(--space-5);">
      <a href="/" class="btn btn-primary">{appState.t('backHomeLink')}</a>
    </div>
  {:else}
    <h1 class="h1">{appState.t('downloadPageTitle')}</h1>
    <div class="download-card">
      <p class="file-title">{meta.fileName}</p>
      <p class="file-meta tabular">
        {appState.t('downloadFileMeta', {
          size: formatBytes(meta.fileSize, appState.locale),
          expires: formatWitaDateTime(meta.expiresAt, appState.locale),
        })}
      </p>

      {#if status === 'done'}
        <p class="done-notice">{appState.t('downloadDoneNotice')}</p>
        <a href="/" class="btn btn-secondary">{appState.t('backHomeLink')}</a>
      {:else}
        <button
          type="button"
          class="btn btn-primary"
          disabled={status === 'downloading'}
          onclick={handleDownload}
        >
          {appState.t('downloadStartBtn')}
        </button>
      {/if}
    </div>
  {/if}
</main>

<style>
  .download-container {
    max-width: 640px;
    padding-top: var(--space-7);
  }

  .download-card {
    margin-top: var(--space-5);
    background-color: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    padding: var(--space-5);
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-4);
  }

  .file-title {
    margin: 0;
    font-size: 20px;
    line-height: 28px;
    font-weight: 600;
    word-break: break-all;
  }

  .file-meta {
    margin: 0;
    font-size: 14px;
    line-height: 20px;
    color: var(--ink-muted);
  }

  .done-notice {
    margin: 0;
    font-size: 14px;
    line-height: 20px;
    font-weight: 600;
    color: var(--success);
  }
</style>
