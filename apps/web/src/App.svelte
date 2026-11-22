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
  import LinkShareDialog from './components/LinkShareDialog.svelte';
  import LinkDownloadView from './components/LinkDownloadView.svelte';
  import Toast from './components/Toast.svelte';

  onMount(() => {
    appState.init();
  });
</script>

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
  <LinkShareDialog />
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
        <p class="keep-open-note tabular">{appState.t('transferLimitsNote')}</p>
        <p class="keep-open-note">{appState.t('keepTabOpenNote')}</p>
      {:else}
        <p class="subtitle">
          {appState.t('subtitleEmpty', {
            selfName: appState.selfDisplayName || 'Anda',
          })}
        </p>
        <p class="keep-open-note tabular">{appState.t('transferLimitsNote')}</p>
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
    {:else}
      <!-- State Empty: belum ada device lain (O-D6 menulis bagasshare.web.id) -->
      <div class="empty-block">
        <p class="empty-text">{appState.t('emptyDescription')}</p>
        <button
          type="button"
          class="btn btn-primary"
          onclick={() => appState.openPairingDialog('enter')}
        >
          {appState.t('usePairingBtn')}
        </button>
      </div>
    {/if}

    <TransferPanel />
  </main>

  <ComposerDialog />
  <IncomingDialog />
  <PairingDialog />
  <LinkShareDialog />
  <Toast />
{/if}

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

  @media (max-width: 639px) {
    .mobile-quota {
      display: block;
    }
  }
</style>
