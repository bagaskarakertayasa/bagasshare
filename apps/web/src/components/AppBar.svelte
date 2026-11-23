<script lang="ts">
  import { appState } from '../lib/state.svelte.js';
</script>

<header class="app-bar">
  <div class="app-bar-inner">
    <div class="brand">
      <!-- Logo O-D5: dua persegi panjang bertumpuk (HP dan laptop) warna --data -->
      <svg
        width="28"
        height="28"
        viewBox="0 0 28 28"
        fill="none"
        aria-hidden="true"
      >
        <rect x="2" y="5" width="18" height="13" rx="2" fill="var(--data)" />
        <rect x="14" y="10" width="11" height="15" rx="2" fill="var(--ink)" />
        <rect x="16" y="12" width="7" height="10" rx="1" fill="var(--surface)" />
      </svg>
      <span class="wordmark">{appState.t('appName')}</span>
    </div>

    <div class="actions">
      <span
        class="quota-indicator tabular"
        class:quota-low={appState.quotaRemaining > 0 && appState.quotaRemaining <= 3}
        class:quota-zero={appState.quotaRemaining <= 0}
      >
        {#if appState.quotaRemaining <= 0}
          {appState.t('quotaExhaustedShort')}
        {:else}
          {appState.t('quotaLabel', { count: appState.quotaRemaining })}
        {/if}
      </span>

      <button
        type="button"
        class="btn btn-secondary"
        onclick={() => appState.openPairingDialog('create')}
      >
        {appState.t('pairingBtn')}
      </button>

      <div class="lang-segmented" role="group" aria-label="Bahasa / Language">
        <button
          type="button"
          class="lang-btn"
          class:active={appState.locale === 'id'}
          aria-pressed={appState.locale === 'id'}
          onclick={() => appState.setLocale('id')}
        >
          ID
        </button>
        <button
          type="button"
          class="lang-btn"
          class:active={appState.locale === 'en'}
          aria-pressed={appState.locale === 'en'}
          onclick={() => appState.setLocale('en')}
        >
          EN
        </button>
      </div>
    </div>
  </div>
</header>

<style>
  .brand {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3);
  }

  .wordmark {
    font-size: 16px;
    line-height: 24px;
    font-weight: 800;
    color: var(--ink);
  }

  .actions {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3);
  }

  .quota-indicator {
    font-size: 14px;
    line-height: 20px;
    font-weight: 600;
    color: var(--ink-muted);
  }

  .quota-low {
    color: var(--warning);
  }

  .quota-zero {
    color: var(--danger);
  }

  .lang-segmented {
    display: inline-flex;
    background-color: var(--surface-sunken);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-sm);
    padding: 2px;
  }

  .lang-btn {
    min-width: 38px;
    min-height: 36px;
    padding: 0 var(--space-2);
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--ink);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }

  .lang-btn.active {
    background-color: var(--ink);
    color: var(--surface);
  }

  @media (max-width: 639px) {
    .quota-indicator {
      display: none;
    }
  }
</style>
