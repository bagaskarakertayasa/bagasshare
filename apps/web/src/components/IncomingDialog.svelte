<script lang="ts">
  import { formatBytes, formatCountdown } from '../lib/i18n/index.js';
  import { appState } from '../lib/state.svelte.js';
  import DeviceSilhouette from './DeviceSilhouette.svelte';

  // DESIGN-BRIEF P2 & S3: Fokus awal ke judul dialog, BUKAN ke tombol Terima,
  // supaya menekan Enter tidak menerima file secara tidak sengaja.
  let headingEl = $state<HTMLHeadingElement | null>(null);

  $effect(() => {
    if (appState.incomingRequest && headingEl) {
      headingEl.focus();
    }
  });

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && appState.incomingRequest) {
      appState.rejectIncoming();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if appState.incomingRequest}
  {@const req = appState.incomingRequest}
  {@const totalBytes = req.files.reduce((acc, f) => acc + f.size, 0)}
  {@const secondsLeft = Math.max(0, (req.expiresAtMs - appState.nowMs) / 1000)}

  <div class="dialog-backdrop">
    <div
      class="dialog-box incoming-box"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="incoming-dialog-title"
      aria-describedby="incoming-dialog-summary"
    >
      <div class="sender-header">
        <DeviceSilhouette
          kind={req.from.kind}
          slot={req.from.colorSlot}
          size={40}
        />
        <h2 id="incoming-dialog-title" bind:this={headingEl} tabindex="-1">
          {appState.t('incomingTitle', {
            name: req.from.displayName,
            count: req.files.length,
          })}
        </h2>
      </div>

      {#if req.status === 'active'}
        <ul class="file-list">
          {#each req.files as f (f.fileId)}
            <li class="file-row">
              <span class="file-name">{f.name}</span>
              <span class="file-size tabular">
                {formatBytes(f.size, appState.locale)}
              </span>
            </li>
          {/each}
        </ul>

        <div id="incoming-dialog-summary" class="summary-row tabular">
          <span>
            {appState.t('incomingTotal', {
              size: formatBytes(totalBytes, appState.locale),
            })}
          </span>
          <span class="countdown">
            {appState.t('incomingExpiresIn', {
              time: formatCountdown(secondsLeft),
            })}
          </span>
        </div>

        <div class="decision-actions">
          <button
            type="button"
            class="btn btn-secondary decision-btn"
            onclick={() => appState.rejectIncoming()}
          >
            {appState.t('rejectBtn')}
          </button>
          <button
            type="button"
            class="btn btn-primary decision-btn"
            onclick={() => appState.acceptIncoming()}
          >
            {appState.t('acceptBtn')}
          </button>
        </div>
      {:else if req.status === 'expired'}
        <p id="incoming-dialog-summary" class="status-notice">
          {appState.t('incomingExpired')}
        </p>
        <div class="decision-actions">
          <button
            type="button"
            class="btn btn-secondary"
            onclick={() => appState.rejectIncoming()}
          >
            {appState.t('dismissBtn')}
          </button>
        </div>
      {:else}
        <p id="incoming-dialog-summary" class="status-notice">
          {appState.t('incomingCancelled', { name: req.from.displayName })}
        </p>
        <div class="decision-actions">
          <button
            type="button"
            class="btn btn-secondary"
            onclick={() => appState.rejectIncoming()}
          >
            {appState.t('dismissBtn')}
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .incoming-box {
    max-width: 480px;
  }

  .sender-header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-4);
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
    max-height: 240px;
    overflow-y: auto;
    border-top: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
  }

  .file-row {
    min-height: 48px;
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

  .file-name {
    font-size: 16px;
    line-height: 24px;
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

  .summary-row {
    margin-top: var(--space-4);
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 14px;
    line-height: 20px;
    font-weight: 600;
  }

  .countdown {
    color: var(--ink-muted);
  }

  .status-notice {
    margin: var(--space-4) 0;
    font-size: 16px;
    line-height: 24px;
    color: var(--danger);
    font-weight: 600;
  }

  .decision-actions {
    margin-top: var(--space-5);
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
  }

  .decision-btn {
    min-width: 120px;
  }

  /* HP: tombol bertumpuk Terima di atas, Tolak di bawah, tinggi 48 (DESIGN-BRIEF 9) */
  @media (max-width: 639px) {
    .decision-actions {
      flex-direction: column-reverse;
    }
    .decision-btn {
      width: 100%;
      min-height: 48px;
    }
  }
</style>
