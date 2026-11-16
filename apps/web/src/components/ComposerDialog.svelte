<script lang="ts">
  import { MAX_TOTAL_SIZE_BYTES } from '@bagas-share/shared';
  import { formatBytes } from '../lib/i18n/index.js';
  import { appState } from '../lib/state.svelte.js';
  import DeviceSilhouette from './DeviceSilhouette.svelte';

  let addInput = $state<HTMLInputElement | null>(null);
  let dialogTitleEl = $state<HTMLHeadingElement | null>(null);

  $effect(() => {
    if (appState.composerTarget && dialogTitleEl) {
      dialogTitleEl.focus();
    }
  });

  const validFiles = $derived(appState.composerFiles.filter((f) => !f.issue));
  const totalValidBytes = $derived(
    validFiles.reduce((acc, f) => acc + f.size, 0)
  );
  const exceedsTotal = $derived(totalValidBytes > MAX_TOTAL_SIZE_BYTES);
  const exceedsQuota = $derived(validFiles.length > appState.quotaRemaining);
  const canSend = $derived(
    validFiles.length > 0 &&
      !exceedsTotal &&
      !exceedsQuota &&
      !appState.composerHashing
  );

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && appState.composerTarget) {
      appState.closeComposer();
    }
  }

  function handleAddMore(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      appState.addFilesToComposer(input.files);
      input.value = '';
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if appState.composerTarget}
  {@const target = appState.composerTarget}
  <div class="dialog-backdrop">
    <div
      class="dialog-box"
      role="dialog"
      aria-modal="true"
      aria-labelledby="composer-dialog-title"
      aria-describedby="composer-limits-desc"
    >
      <div class="dialog-header">
        <div class="target-title">
          <DeviceSilhouette kind={target.kind} slot={target.colorSlot} size={32} />
          <h2 id="composer-dialog-title" bind:this={dialogTitleEl} tabindex="-1">
            {appState.t('composerTitle', { name: target.displayName })}
          </h2>
        </div>
        <button
          type="button"
          class="btn btn-secondary"
          onclick={() => appState.closeComposer()}
        >
          {appState.t('dismissBtn')}
        </button>
      </div>

      <ul class="file-list">
        {#each appState.composerFiles as item (item.fileId)}
          <li class="file-row" class:has-issue={Boolean(item.issue)}>
            <div class="file-info">
              <span class="file-name">{item.name}</span>
              {#if item.issue === 'empty'}
                <span class="issue-text">{appState.t('issueEmpty')}</span>
              {:else if item.issue === 'too_large'}
                <span class="issue-text">{appState.t('issueTooLarge')}</span>
              {:else if item.issue === 'blocked_extension'}
                <span class="issue-text">
                  {appState.t('issueBlockedExt', {
                    ext: item.blockedExtension || '',
                  })}
                </span>
              {/if}
            </div>

            <div class="file-right">
              <span class="file-size tabular">
                {formatBytes(item.size, appState.locale)}
              </span>
              <button
                type="button"
                class="btn btn-secondary btn-small"
                aria-label={appState.t('removeFileAria', { name: item.name })}
                onclick={() => appState.removeComposerFile(item.fileId)}
              >
                {appState.t('removeFileBtn')}
              </button>
            </div>
          </li>
        {/each}
      </ul>

      <div class="add-more-row">
        <input
          bind:this={addInput}
          type="file"
          multiple
          hidden
          class="sr-only"
          tabindex="-1"
          onchange={handleAddMore}
        />
        <button
          type="button"
          class="btn btn-secondary"
          onclick={() => addInput?.click()}
        >
          {appState.t('addFilesBtn')}
        </button>
      </div>

      <div id="composer-limits-desc" class="totals-bar">
        <p class="totals-line tabular">
          {appState.t('composerTotals', {
            count: validFiles.length,
            size: formatBytes(totalValidBytes, appState.locale),
          })}
        </p>
        <p class="quota-line tabular">
          {appState.t('composerQuotaNote', {
            remaining: appState.quotaRemaining,
          })}
        </p>

        {#if validFiles.length === 0}
          <p class="error-line">{appState.t('composerErrNoneValid')}</p>
        {:else if exceedsTotal}
          <p class="error-line">
            {appState.t('composerErrTotalLimit', {
              size: formatBytes(totalValidBytes, appState.locale),
            })}
          </p>
        {:else if exceedsQuota}
          <p class="error-line">
            {appState.t('composerErrQuota', {
              remaining: appState.quotaRemaining,
              selected: validFiles.length,
              diff: validFiles.length - appState.quotaRemaining,
            })}
          </p>
        {/if}
      </div>

      <div class="dialog-footer">
        <button
          type="button"
          class="btn btn-secondary"
          onclick={() => appState.closeComposer()}
        >
          {appState.t('cancelBtn')}
        </button>
        <button
          type="button"
          class="btn btn-primary"
          disabled={!canSend}
          onclick={() => appState.confirmComposerSend()}
        >
          {appState.t('sendFilesBtn', { count: validFiles.length })}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: var(--space-4);
  }

  .target-title {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  h2 {
    margin: 0;
    font-size: 20px;
    line-height: 28px;
    font-weight: 600;
  }

  .file-list {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 280px;
    overflow-y: auto;
    border-top: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
  }

  .file-row {
    min-height: 56px;
    padding: var(--space-2) 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    border-bottom: 1px solid var(--line);
  }

  .file-row:last-child {
    border-bottom: none;
  }

  .file-info {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .file-name {
    font-size: 16px;
    line-height: 24px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .issue-text {
    font-size: 14px;
    line-height: 20px;
    color: var(--danger);
    font-weight: 600;
  }

  .file-right {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3);
    flex-shrink: 0;
  }

  .file-size {
    font-size: 12px;
    line-height: 16px;
    color: var(--ink-muted);
  }

  .btn-small {
    min-height: 36px;
    padding: 0 var(--space-3);
  }

  .add-more-row {
    margin-top: var(--space-3);
  }

  .totals-bar {
    margin-top: var(--space-4);
    padding: var(--space-3);
    background-color: var(--surface-sunken);
    border-radius: var(--radius-sm);
  }

  .totals-line,
  .quota-line {
    margin: 0;
    font-size: 14px;
    line-height: 20px;
    color: var(--ink);
  }

  .quota-line {
    color: var(--ink-muted);
    margin-top: var(--space-1);
  }

  .error-line {
    margin: var(--space-2) 0 0 0;
    font-size: 14px;
    line-height: 20px;
    color: var(--danger);
    font-weight: 600;
  }

  .dialog-footer {
    margin-top: var(--space-5);
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
  }
</style>
