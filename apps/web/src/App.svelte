<script lang="ts">
  import { onMount } from 'svelte';
  import { appState } from './lib/state.svelte.js';
  import AppBar from './components/AppBar.svelte';
  import SystemBanner from './components/SystemBanner.svelte';
  import DeviceTile from './components/DeviceTile.svelte';
  import TransferPanel from './components/TransferPanel.svelte';
  import ComposerDialog from './components/ComposerDialog.svelte';
  import IncomingDialog from './components/IncomingDialog.svelte';
  import PairingDialog from './components/PairingDialog.svelte';
  import LinkDownloadView from './components/LinkDownloadView.svelte';
  import Toast from './components/Toast.svelte';

  let standaloneFileInput = $state<HTMLInputElement | null>(null);
  const currentYear = new Date().getFullYear();

  function handleStandaloneFiles(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      appState.openComposerWithFiles(null, input.files);
      input.value = '';
    }
  }

  function handleWindowDrop(e: DragEvent) {
    if (appState.composerOpen || appState.incomingRequest || appState.pairingOpen) {
      return;
    }
    const targetEl = e.target as HTMLElement | null;
    if (targetEl?.closest('.device-tile')) {
      return;
    }
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      e.preventDefault();
      appState.openComposerWithFiles(null, e.dataTransfer.files);
    }
  }

  onMount(() => {
    appState.init();
  });
</script>

<svelte:window
  ondragover={(e) => e.preventDefault()}
  ondrop={handleWindowDrop}
/>

{#if !appState.webrtcSupported}
  <!-- S10: Browser tidak didukung -->
  <main class="canvas full-state">
    <p class="wordmark-only">{appState.t('appName')}</p>
    <h1 class="h1">{appState.t('unsupportedTitle')}</h1>
    <p class="subtitle">{appState.t('unsupportedBody')}</p>
  </main>
{:else if appState.isNotFoundRoute}
  <!-- S11: Halaman tidak ditemukan -->
  <main class="canvas full-state">
    <p class="wordmark-only">{appState.t('appName')}</p>
    <h1 class="h1">{appState.t('notFoundTitle')}</h1>
    <p class="subtitle">{appState.t('notFoundBody')}</p>
    <div style="margin-top: var(--space-4);">
      <a href="/" class="btn btn-primary">{appState.t('backHomeLink')}</a>
    </div>
  </main>
{:else if appState.downloadLinkId}
  <AppBar />
  <LinkDownloadView linkId={appState.downloadLinkId} />
  <PairingDialog />
  <Toast />
{:else}
  <a href="#main-devices" class="skip-link">
    {appState.t('skipToMain')}
  </a>

  <AppBar />
  <SystemBanner />

  <main id="main-devices" class="canvas">
    <div class="title-row">
      <h1 class="h1">{appState.t('homeTitle')}</h1>

      {#if appState.connectionState === 'connecting' && !appState.selfDisplayName}
        <p class="subtitle">{appState.t('connectingServer')}</p>
      {:else if appState.peers.length > 0}
        <p class="subtitle tabular">
          {appState.t('subtitleConnected', {
            count: appState.peers.length,
            selfName: appState.selfDisplayName || 'Anda',
          })}
        </p>
        <p class="keep-open-note">{appState.t('keepTabOpenNote')}</p>
      {:else}
        <p class="subtitle">
          {appState.t('subtitleEmpty', {
            selfName: appState.selfDisplayName || 'Anda',
          })}
        </p>
      {/if}

      <p class="mobile-quota tabular">
        {#if appState.quotaRemaining <= 0}
          {appState.t('quotaExhaustedShort')}
        {:else}
          {appState.t('quotaLabel', { count: appState.quotaRemaining })}
        {/if}
      </p>
    </div>

    <!-- Region aria-live polite untuk pengumuman device masuk/keluar -->
    <div class="sr-only" aria-live="polite">
      {appState.liveAnnouncement}
    </div>

    <input
      bind:this={standaloneFileInput}
      type="file"
      multiple
      hidden
      class="sr-only"
      tabindex="-1"
      onchange={handleStandaloneFiles}
    />

    {#if appState.connectionState === 'connecting' && !appState.selfDisplayName}
      <!-- State Loading: satu petak skeleton datar -->
      <div class="device-grid">
        <div class="skeleton-tile" aria-hidden="true"></div>
      </div>
    {:else if appState.peers.length > 0}
      <!-- State Berisi: Petak per device -->
      <ul class="device-grid" role="list">
        {#each appState.peers as peer (peer.deviceId)}
          <DeviceTile {peer} />
        {/each}
      </ul>
      <div class="standalone-link-bar">
        <button
          type="button"
          class="btn btn-secondary"
          onclick={() => standaloneFileInput?.click()}
        >
          {appState.t('directUploadLinkBtn')}
        </button>
      </div>
    {:else}
      <!-- State Empty: belum ada device lain (O-D6 menulis bagasshare.web.id) -->
      <div class="empty-block">
        <p class="empty-text">{appState.t('emptyDescription')}</p>
        <div class="empty-actions">
          <button
            type="button"
            class="btn btn-primary"
            onclick={() => appState.openPairingDialog('enter')}
          >
            {appState.t('usePairingBtn')}
          </button>
          <button
            type="button"
            class="btn btn-secondary"
            onclick={() => standaloneFileInput?.click()}
          >
            {appState.t('directUploadLinkBtn')}
          </button>
        </div>
      </div>
    {/if}

    <TransferPanel />
  </main>

  <ComposerDialog />
  <IncomingDialog />
  <PairingDialog />
  <Toast />
{/if}

<footer class="app-footer">
  <div class="app-footer-inner tabular">
    Copyright © {currentYear} Bagaskara Kertayasa
  </div>
</footer>

<style>
  .full-state {
    padding-top: var(--space-8);
    max-width: 640px;
  }

  .wordmark-only {
    margin: 0 0 var(--space-3) 0;
    font-size: 16px;
    font-weight: 800;
  }

  .mobile-quota {
    display: none;
    margin: var(--space-2) 0 0 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--ink-muted);
  }

  .skeleton-tile {
    min-height: 156px;
    border-radius: var(--radius-lg);
    background-color: var(--surface-sunken);
  }

  .empty-block {
    background-color: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    padding: var(--space-5);
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-4);
  }

  .empty-text {
    margin: 0;
    font-size: 16px;
    line-height: 24px;
    color: var(--ink);
    max-width: 65ch;
  }

  .empty-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }

  .standalone-link-bar {
    margin-top: var(--space-4);
  }

  .app-footer {
    border-top: 1px solid var(--line);
    background-color: var(--ground);
  }

  .app-footer-inner {
    max-width: 1160px;
    margin: 0 auto;
    padding: var(--space-4) var(--space-6);
    font-size: 12px;
    line-height: 16px;
    color: var(--ink-muted);
    text-align: center;
  }

  @media (max-width: 1023px) {
    .app-footer-inner {
      padding-left: var(--space-5);
      padding-right: var(--space-5);
    }
  }

  @media (max-width: 639px) {
    .app-footer-inner {
      padding-left: var(--space-4);
      padding-right: var(--space-4);
    }
    .mobile-quota {
      display: block;
    }
    .empty-actions {
      width: 100%;
      flex-direction: column;
    }
    .empty-actions .btn,
    .standalone-link-bar .btn {
      width: 100%;
    }
  }
</style>
