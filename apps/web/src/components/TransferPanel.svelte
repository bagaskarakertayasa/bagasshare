<script lang="ts">
  import { formatBytes, formatCountdown } from '../lib/i18n/index.js';
  import { appState, type TransferRowItem } from '../lib/state.svelte.js';

  function statusLabel(row: TransferRowItem): string {
    switch (row.state) {
      case 'waiting_approval': {
        const sec = row.expiresAtMs
          ? Math.max(0, (row.expiresAtMs - appState.nowMs) / 1000)
          : 0;
        return appState.t('statusWaiting', {
          name: row.peerDisplayName,
          time: formatCountdown(sec),
        });
      }
      case 'connecting':
        return appState.t('statusConnecting', { name: row.peerDisplayName });
      case 'transferring':
        return row.role === 'sender'
          ? appState.t('statusSending', { count: row.files.length })
          : appState.t('statusReceiving', { count: row.files.length });
      case 'paused':
        return row.role === 'sender'
          ? appState.t('statusPausedSender')
          : appState.t('statusPausedReceiver');
      case 'completed':
        return appState.t('statusCompleted');
      case 'rejected':
        return appState.t('statusRejected', { name: row.peerDisplayName });
      case 'expired':
        return appState.t('statusExpired', { name: row.peerDisplayName });
      case 'busy':
        return appState.t('statusBusy', { name: row.peerDisplayName });
      case 'failed_p2p':
        return appState.t('statusFailedP2P');
      case 'failed_checksum':
        return appState.t('statusFailedChecksum');
      case 'failed_storage':
        return appState.t('statusFailedStorage');
      case 'cancelled':
        return appState.t('statusCancelled');
    }
  }

  function isActiveTransfer(state: TransferRowItem['state']): boolean {
    return (
      state === 'waiting_approval' ||
      state === 'connecting' ||
      state === 'transferring' ||
      state === 'paused'
    );
  }

  function isErrorState(state: TransferRowItem['state']): boolean {
    return (
      state === 'rejected' ||
      state === 'expired' ||
      state === 'busy' ||
      state === 'failed_p2p' ||
      state === 'failed_checksum' ||
      state === 'failed_storage' ||
      state === 'cancelled'
    );
  }
</script>

{#if appState.transfers.length > 0}
  <section class="transfer-panel" aria-labelledby="transfer-panel-heading">
    <h2 id="transfer-panel-heading" class="panel-heading">
      {appState.t('transferPanelTitle')}
    </h2>

    <ul class="transfer-list">
      {#each appState.transfers as row (row.transferId)}
        <li class="transfer-row">
          <div class="row-top">
            <div class="peer-badge">
              <span
                class="slot-dot slot-{row.peerColorSlot}"
                aria-hidden="true"
              ></span>
              <span class="peer-name">{row.peerDisplayName}</span>
            </div>

            <div
              class="row-status"
              class:status-done={row.state === 'completed'}
              class:status-paused={row.state === 'paused'}
              class:status-error={isErrorState(row.state)}
              aria-live="polite"
            >
              {statusLabel(row)}
            </div>

            <div class="row-action">
              {#if isActiveTransfer(row.state)}
                <button
                  type="button"
                  class="btn btn-secondary btn-small"
                  onclick={() => appState.cancelTransferRow(row.transferId)}
                >
                  {appState.t('cancelBtn')}
                </button>
              {:else}
                <button
                  type="button"
                  class="btn btn-secondary btn-small"
                  onclick={() => appState.dismissTransferRow(row.transferId)}
                >
                  {appState.t('dismissBtn')}
                </button>
              {/if}
            </div>
          </div>

          <ul class="files-sublist">
            {#each row.files as f (f.fileId)}
              {@const pct =
                f.size > 0
                  ? Math.min(100, Math.round((f.bytesTransferred / f.size) * 100))
                  : 0}
              <li class="file-subrow">
                <div class="file-meta-line">
                  <span class="file-name">{f.name}</span>
                  <span class="file-stats tabular">
                    {#if f.status === 'waiting' && f.bytesTransferred === 0}
                      {appState.t('fileWaiting')} · {formatBytes(f.size, appState.locale)}
                    {:else}
                      {pct}% ·
                      {appState.t('fileProgressBytes', {
                        sent: formatBytes(f.bytesTransferred, appState.locale),
                        total: formatBytes(f.size, appState.locale),
                      })}
                    {/if}
                  </span>
                </div>

                <div class="progress-and-download">
                  <div
                    class="progress-track"
                    role="progressbar"
                    aria-label={f.name}
                    aria-valuenow={pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      class="progress-fill"
                      class:fill-done={row.state === 'completed' || f.status === 'done'}
                      class:fill-paused={row.state === 'paused'}
                      class:fill-error={isErrorState(row.state)}
                      style="width: {pct}%;"
                    ></div>
                  </div>

                  {#if row.role === 'receiver' && f.downloadUrl}
                    <button
                      type="button"
                      class="btn {f.downloaded ? 'btn-secondary' : 'btn-primary'} btn-small"
                      onclick={() => appState.triggerSingleFileDownload(f)}
                    >
                      {f.downloaded
                        ? appState.t('downloadedBtn')
                        : appState.t('downloadBtn')}
                    </button>
                  {/if}
                  {#if f.cloudShareUrl}
                    <button
                      type="button"
                      class="btn btn-secondary btn-small"
                      onclick={() => appState.copyCloudFileLink(f)}
                    >
                      {f.copied
                        ? appState.t('linkCopiedBtn')
                        : appState.t('linkCopyBtn')}
                    </button>
                  {/if}
                </div>
                {#if f.cloudShareUrl}
                  <a
                    href={f.cloudShareUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="cloud-link-url"
                  >
                    {f.cloudShareUrl}
                  </a>
                {/if}
              </li>
            {/each}
          </ul>

          {#if row.state === 'transferring'}
            <p class="ios-note">{appState.t('iosKeepScreenOnNote')}</p>
          {/if}
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .transfer-panel {
    margin-top: var(--space-6);
    background-color: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    padding: var(--space-5);
  }

  .panel-heading {
    margin: 0 0 var(--space-4) 0;
    font-size: 20px;
    line-height: 28px;
    font-weight: 600;
  }

  .transfer-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .transfer-row {
    padding: var(--space-4) 0;
    border-top: 1px solid var(--line);
  }

  .transfer-row:first-child {
    border-top: none;
    padding-top: 0;
  }

  .transfer-row:last-child {
    padding-bottom: 0;
  }

  .row-top {
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    flex-wrap: wrap;
  }

  .peer-badge {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }

  .slot-dot {
    width: 12px;
    height: 12px;
    border-radius: var(--radius-full);
    flex-shrink: 0;
  }

  .slot-1 {
    background-color: var(--slot-1-fg);
  }
  .slot-2 {
    background-color: var(--slot-2-fg);
  }
  .slot-3 {
    background-color: var(--slot-3-fg);
  }
  .slot-4 {
    background-color: var(--slot-4-fg);
  }

  .peer-name {
    font-size: 16px;
    line-height: 24px;
    font-weight: 600;
  }

  .row-status {
    font-size: 14px;
    line-height: 20px;
    font-weight: 600;
    color: var(--ink);
  }

  .status-done {
    color: var(--success);
  }

  .status-paused {
    color: var(--warning);
  }

  .status-error {
    color: var(--danger);
  }

  .btn-small {
    min-height: 36px;
    padding: 0 var(--space-3);
  }

  .files-sublist {
    list-style: none;
    margin: var(--space-3) 0 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .file-subrow {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .file-meta-line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .file-name {
    font-size: 16px;
    line-height: 24px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-stats {
    font-size: 12px;
    line-height: 16px;
    color: var(--ink-muted);
    flex-shrink: 0;
  }

  .progress-and-download {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .progress-track {
    flex: 1;
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

  .fill-done {
    background-color: var(--success);
  }

  .fill-paused {
    background-color: var(--warning);
  }

  .fill-error {
    background-color: var(--danger);
  }

  .ios-note {
    margin: var(--space-3) 0 0 0;
    font-size: 12px;
    line-height: 16px;
    color: var(--ink-muted);
  }

  .cloud-link-url {
    font-size: 12px;
    line-height: 16px;
    color: var(--data);
    font-weight: 600;
    word-break: break-all;
    text-decoration: underline;
  }

  @media (max-width: 639px) {
    .transfer-panel {
      padding: var(--space-4);
    }
  }
</style>
