<script lang="ts">
  import { appState } from '../lib/state.svelte.js';
</script>

{#if appState.toasts.length > 0}
  <div class="toast-region">
    {#each appState.toasts as toast (toast.id)}
      <div
        class="toast-box"
        class:toast-error={toast.kind === 'error'}
        role={toast.kind === 'error' ? 'alert' : 'status'}
      >
        <span class="toast-msg">{toast.message}</span>
        <button
          type="button"
          class="btn btn-secondary btn-small"
          onclick={() => appState.dismissToast(toast.id)}
        >
          {appState.t('dismissBtn')}
        </button>
      </div>
    {/each}
  </div>
{/if}

<style>
  .toast-region {
    position: fixed;
    top: var(--space-4);
    right: var(--space-4);
    z-index: 150;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    max-width: 360px;
    width: calc(100% - 32px);
  }

  .toast-box {
    background-color: var(--surface);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-float);
    padding: var(--space-3) var(--space-4);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .toast-error {
    border-color: var(--danger);
    color: var(--danger);
  }

  .toast-msg {
    font-size: 14px;
    line-height: 20px;
    font-weight: 600;
  }

  .btn-small {
    min-height: 36px;
    padding: 0 var(--space-3);
  }

  @media (max-width: 639px) {
    .toast-region {
      top: 64px;
      left: var(--space-4);
      right: var(--space-4);
      max-width: none;
    }
  }
</style>
