<script lang="ts">
  import type { PeerInfo } from '@bagas-share/shared';
  import { appState } from '../lib/state.svelte.js';
  import DeviceSilhouette from './DeviceSilhouette.svelte';

  let { peer }: { peer: PeerInfo } = $props();

  let dragOver = $state(false);
  let fileInput: HTMLInputElement | null = null;

  const isDisabled = $derived(peer.busy || appState.quotaRemaining <= 0);

  function handleTileClick() {
    if (isDisabled) return;
    fileInput?.click();
  }

  function handleFilesSelected(e: Event) {
    const target = e.currentTarget as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      appState.openComposerWithFiles(peer, target.files);
      target.value = '';
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    if (!isDisabled) {
      dragOver = true;
    }
  }

  function handleDragLeave() {
    dragOver = false;
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    if (isDisabled) return;
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      appState.openComposerWithFiles(peer, e.dataTransfer.files);
    }
  }
</script>

<li>
  <input
    bind:this={fileInput}
    type="file"
    multiple
    hidden
    class="sr-only"
    tabindex="-1"
    onchange={handleFilesSelected}
  />
  <button
    type="button"
    class="device-tile"
    class:drag-over={dragOver}
    disabled={isDisabled}
    aria-label={appState.t('sendFileToAria', { name: peer.displayName })}
    onclick={handleTileClick}
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    ondrop={handleDrop}
  >
    <DeviceSilhouette kind={peer.kind} slot={peer.colorSlot} size={44} />

    <div class="tile-body">
      <span class="device-name">{peer.displayName}</span>
      <span class="device-source">
        {peer.source === 'pairing_code'
          ? appState.t('sourcePairing')
          : appState.t('sourceAutoIp')}
      </span>
      <span class="device-hint">
        {#if appState.quotaRemaining <= 0}
          {appState.t('quotaZeroHint')}
        {:else if peer.busy}
          {appState.t('busyHint')}
        {:else}
          {appState.t('dropHint')}
        {/if}
      </span>
    </div>
  </button>
</li>

<style>
  .device-tile {
    width: 100%;
    min-height: 156px;
    background-color: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    padding: var(--space-5);
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-4);
    text-align: left;
    cursor: pointer;
    transition: background-color var(--dur-fast) var(--ease-out);
  }

  .device-tile:hover:not(:disabled) {
    background-color: var(--surface-sunken);
  }

  .device-tile.drag-over {
    border: 2px solid var(--ink);
    background-color: var(--surface-sunken);
  }

  .device-tile:disabled {
    cursor: not-allowed;
    background-color: var(--surface-sunken);
  }

  .tile-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    width: 100%;
  }

  .device-name {
    font-size: 16px;
    line-height: 24px;
    font-weight: 600;
    color: var(--ink);
  }

  .device-source {
    font-size: 14px;
    line-height: 20px;
    color: var(--ink-muted);
  }

  .device-hint {
    font-size: 12px;
    line-height: 16px;
    color: var(--ink-muted);
    margin-top: var(--space-1);
  }

  /* HP (< 640px): petak jadi baris 72 px (DESIGN-BRIEF 9) */
  @media (max-width: 639px) {
    .device-tile {
      min-height: 72px;
      padding: var(--space-4);
      flex-direction: row;
      align-items: center;
      justify-content: flex-start;
    }
    .device-hint {
      display: none;
    }
  }
</style>
