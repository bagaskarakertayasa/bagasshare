<script lang="ts">
  import { appState } from '../lib/state.svelte.js';

  let resumeInput = $state<HTMLInputElement | null>(null);

  // DESIGN-BRIEF S8: Satu banner pada satu waktu, prioritas:
  // 1. Offline browser, 2. Server terputus, 3. Kuota habis, 4. Resume.
  const activeBanner = $derived.by(() => {
    if (appState.browserOffline) return 'offline';
    if (appState.connectionState === 'disconnected') return 'server_error';
    if (appState.quotaRemaining <= 0) return 'quota_zero';
    if (appState.pendingSenderResume) return 'resume';
    return null;
  });

  function handleResumeFiles(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    appState.handleSenderResumeFilesSelected(input.files);
    input.value = '';
  }
</script>

{#if activeBanner}
  <div
    class="system-banner"
    class:banner-danger={activeBanner === 'server_error' || activeBanner === 'quota_zero'}
    class:banner-warning={activeBanner === 'offline' || activeBanner === 'resume'}
    role="status"
  >
    <div class="banner-inner">
      {#if activeBanner === 'offline'}
        <span>{appState.t('bannerOffline')}</span>
      {:else if activeBanner === 'server_error'}
        <span>{appState.t('bannerServerError')}</span>
        <button
          type="button"
          class="btn btn-secondary btn-small"
          onclick={() => appState.reconnectNow()}
        >
          {appState.t('retryNow')}
        </button>
      {:else if activeBanner === 'quota_zero'}
        <span>{appState.t('bannerQuotaZero')}</span>
      {:else if activeBanner === 'resume' && appState.pendingSenderResume}
        {@const summary = appState.pendingSenderResume.files
          .map((f) => f.name)
          .join(', ')}
        <span>
          {appState.t('bannerResumeSender', { fileSummary: summary })}
        </span>
        <div class="banner-actions">
          <input
            bind:this={resumeInput}
            type="file"
            multiple
            class="sr-only"
            tabindex="-1"
            onchange={handleResumeFiles}
          />
          <button
            type="button"
            class="btn btn-primary btn-small"
            onclick={() => resumeInput?.click()}
          >
            {appState.t('selectSameFilesBtn')}
          </button>
          <button
            type="button"
            class="btn btn-secondary btn-small"
            onclick={() => appState.dismissSenderResumeBanner()}
          >
            {appState.t('dismissBtn')}
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .system-banner {
    width: 100%;
    border-bottom: 1px solid var(--line);
    background-color: var(--surface);
  }

  .banner-danger {
    background-color: var(--surface);
    color: var(--danger);
  }

  .banner-warning {
    background-color: var(--warning-bg);
    color: var(--ink);
  }

  .banner-inner {
    max-width: 1160px;
    margin: 0 auto;
    padding: var(--space-3) var(--space-6);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    flex-wrap: wrap;
    font-size: 14px;
    line-height: 20px;
    font-weight: 600;
  }

  .banner-actions {
    display: inline-flex;
    gap: var(--space-2);
  }

  .btn-small {
    min-height: 36px;
    padding: 0 var(--space-3);
  }

  @media (max-width: 1023px) {
    .banner-inner {
      padding-left: var(--space-5);
      padding-right: var(--space-5);
    }
  }

  @media (max-width: 639px) {
    .banner-inner {
      padding-left: var(--space-4);
      padding-right: var(--space-4);
    }
  }
</style>
