<script lang="ts">
  import { appState } from '../lib/state.svelte.js';

  let digits = $state<string[]>(['', '', '', '', '', '']);
  let inputs = $state<Array<HTMLInputElement | null>>([null, null, null, null, null, null]);
  let copied = $state(false);
  let titleEl = $state<HTMLHeadingElement | null>(null);

  $effect(() => {
    if (appState.pairingOpen && titleEl) {
      titleEl.focus();
    }
  });

  const fullCode = $derived(digits.join(''));
  const isSixDigits = $derived(/^\d{6}$/.test(fullCode));
  const isRateLimited = $derived(
    appState.pairingError?.reason === 'rate_limited'
  );

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && appState.pairingOpen) {
      appState.closePairingDialog();
    }
  }

  function handleDigitInput(index: number, e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const val = input.value.replace(/\D/g, '');
    digits[index] = val.slice(-1);
    input.value = digits[index]!;
    if (digits[index] && index < 5) {
      inputs[index + 1]?.focus();
    }
  }

  function handleDigitKeydown(index: number, e: KeyboardEvent) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputs[index - 1]?.focus();
    }
  }

  function handlePaste(e: ClipboardEvent) {
    e.preventDefault();
    const text = (e.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, 6);
    if (!text) return;
    for (let i = 0; i < 6; i++) {
      digits[i] = text[i] || '';
      if (inputs[i]) inputs[i]!.value = digits[i]!;
    }
    const nextIdx = Math.min(5, text.length);
    inputs[nextIdx]?.focus();
  }

  async function copyCode() {
    if (!appState.createdPairingCode) return;
    try {
      await navigator.clipboard.writeText(appState.createdPairingCode.code);
      copied = true;
      setTimeout(() => {
        copied = false;
      }, 2_000);
    } catch {
      // abaikan
    }
  }

  function formatWitaExpiry(iso: string): string {
    try {
      return new Intl.DateTimeFormat(
        appState.locale === 'id' ? 'id-ID' : 'en-US',
        {
          timeZone: 'Asia/Makassar',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }
      ).format(new Date(iso));
    } catch {
      return iso;
    }
  }

  function errorMessage(): string {
    const err = appState.pairingError;
    if (!err) return '';
    switch (err.reason) {
      case 'invalid':
        return appState.t('pairErrInvalid');
      case 'expired':
        return appState.t('pairErrExpired');
      case 'used':
        return appState.t('pairErrUsed');
      case 'group_full':
        return appState.t('pairErrGroupFull');
      case 'rate_limited': {
        const minutes = Math.max(1, Math.ceil((err.retryAfterSec || 60) / 60));
        return appState.t('pairErrRateLimited', { minutes });
      }
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if appState.pairingOpen}
  <div class="dialog-backdrop">
    <div
      class="dialog-box pairing-box"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pairing-dialog-title"
    >
      <div class="dialog-header">
        <h2 id="pairing-dialog-title" bind:this={titleEl} tabindex="-1">
          {appState.t('pairingTitle')}
        </h2>
        <button
          type="button"
          class="btn btn-secondary"
          onclick={() => appState.closePairingDialog()}
        >
          {appState.t('dismissBtn')}
        </button>
      </div>

      <div class="segmented-track" role="tablist">
        <button
          type="button"
          role="tab"
          class="seg-option"
          class:active={appState.pairingTab === 'create'}
          aria-selected={appState.pairingTab === 'create'}
          onclick={() => {
            appState.pairingTab = 'create';
            appState.pairingError = null;
            if (!appState.createdPairingCode) appState.requestNewPairingCode();
          }}
        >
          {appState.t('tabCreateCode')}
        </button>
        <button
          type="button"
          role="tab"
          class="seg-option"
          class:active={appState.pairingTab === 'enter'}
          aria-selected={appState.pairingTab === 'enter'}
          onclick={() => {
            appState.pairingTab = 'enter';
            appState.pairingError = null;
          }}
        >
          {appState.t('tabEnterCode')}
        </button>
      </div>

      {#if appState.pairingTab === 'create'}
        <div class="tab-body">
          {#if appState.createdPairingCode}
            <div class="code-display tabular" aria-live="polite">
              {appState.createdPairingCode.code.split('').join(' ')}
            </div>
            <div class="code-actions">
              <button type="button" class="btn btn-secondary" onclick={copyCode}>
                {copied ? appState.t('copiedCodeBtn') : appState.t('copyCodeBtn')}
              </button>
              <button
                type="button"
                class="btn btn-secondary"
                disabled={appState.pairingLoading}
                onclick={() => appState.requestNewPairingCode()}
              >
                {appState.t('generateCodeBtn')}
              </button>
            </div>
            <p class="expiry-note">
              {appState.t('pairingExpiresNote', {
                time: formatWitaExpiry(appState.createdPairingCode.expiresAt),
              })}
            </p>
          {:else}
            <p class="expiry-note">{appState.t('connectingServer')}</p>
          {/if}
        </div>
      {:else}
        <form
          class="tab-body"
          onsubmit={(e) => {
            e.preventDefault();
            if (isSixDigits && !isRateLimited && !appState.pairingLoading) {
              appState.submitPairingCode(fullCode);
            }
          }}
        >
          <div class="code-inputs" onpaste={handlePaste}>
            {#each digits as d, idx}
              <input
                bind:this={inputs[idx]}
                type="text"
                inputmode="numeric"
                maxlength="1"
                value={d}
                disabled={isRateLimited || appState.pairingLoading}
                aria-label={appState.t('pairDigitAria', { index: idx + 1 })}
                aria-invalid={Boolean(appState.pairingError)}
                aria-describedby={appState.pairingError ? 'pair-error-msg' : undefined}
                class="code-cell tabular"
                class:cell-error={Boolean(appState.pairingError)}
                oninput={(e) => handleDigitInput(idx, e)}
                onkeydown={(e) => handleDigitKeydown(idx, e)}
              />
            {/each}
          </div>

          {#if appState.pairingError}
            <p id="pair-error-msg" class="pair-error" role="alert">
              {errorMessage()}
            </p>
          {/if}

          <div class="submit-row">
            <button
              type="submit"
              class="btn btn-primary"
              disabled={!isSixDigits || isRateLimited || appState.pairingLoading}
            >
              {appState.t('joinCodeBtn')}
            </button>
          </div>
        </form>
      {/if}
    </div>
  </div>
{/if}

<style>
  .pairing-box {
    max-width: 440px;
  }

  .dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: var(--space-4);
  }

  h2 {
    margin: 0;
    font-size: 20px;
    line-height: 28px;
    font-weight: 600;
  }

  .segmented-track {
    display: inline-flex;
    align-self: flex-start;
    background-color: var(--surface-sunken);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-sm);
    padding: 2px;
    margin-bottom: var(--space-5);
  }

  .seg-option {
    min-height: 36px;
    padding: 0 var(--space-4);
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--ink);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }

  .seg-option.active {
    background-color: var(--ink);
    color: var(--surface);
  }

  .tab-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  /* --text-code: 48 / 52 (HP 40 / 44), weight 800, tracking -0.02em, tabular (DESIGN-BRIEF 3.2) */
  .code-display {
    font-size: 48px;
    line-height: 52px;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: var(--ink);
  }

  .code-actions {
    display: flex;
    gap: var(--space-3);
  }

  .expiry-note {
    margin: 0;
    font-size: 12px;
    line-height: 16px;
    color: var(--ink-muted);
  }

  .code-inputs {
    display: flex;
    gap: var(--space-2);
  }

  .code-cell {
    width: 48px;
    height: 56px;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-sm);
    background-color: var(--surface-sunken);
    text-align: center;
    font-size: 20px;
    font-weight: 800;
    color: var(--ink);
  }

  .code-cell.cell-error {
    border-color: var(--danger);
  }

  .pair-error {
    margin: 0;
    font-size: 14px;
    line-height: 20px;
    color: var(--danger);
    font-weight: 600;
  }

  .submit-row {
    display: flex;
    justify-content: flex-end;
  }

  @media (max-width: 639px) {
    .code-display {
      font-size: 40px;
      line-height: 44px;
    }
  }
</style>
