<script lang="ts">
  import type { ColorSlot, DeviceKind } from '@bagas-share/shared';

  let {
    kind = 'unknown',
    slot = 1,
    size = 40,
  }: {
    kind?: DeviceKind;
    slot?: ColorSlot;
    size?: number;
  } = $props();
</script>

<span
  class="silhouette-badge slot-{slot}"
  style="width: {size}px; height: {size}px;"
  aria-hidden="true"
>
  {#if kind === 'phone'}
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="2" width="12" height="20" rx="2" />
      <rect x="10" y="18" width="4" height="1.5" fill="var(--surface)" />
    </svg>
  {:else if kind === 'tablet'}
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <circle cx="12" cy="18.5" r="1" fill="var(--surface)" />
    </svg>
  {:else if kind === 'laptop'}
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <rect x="4" y="4" width="16" height="11" rx="1.5" />
      <rect x="2" y="16.5" width="20" height="2.5" rx="1" />
    </svg>
  {:else}
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <rect x="3" y="3" width="18" height="12" rx="1.5" />
      <rect x="9" y="16.5" width="6" height="2" />
      <rect x="7" y="19" width="10" height="1.5" />
    </svg>
  {/if}
</span>

<style>
  .silhouette-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    flex-shrink: 0;
  }

  .slot-1 {
    background-color: var(--slot-1-bg);
    color: var(--slot-1-fg);
  }
  .slot-2 {
    background-color: var(--slot-2-bg);
    color: var(--slot-2-fg);
  }
  .slot-3 {
    background-color: var(--slot-3-bg);
    color: var(--slot-3-fg);
  }
  .slot-4 {
    background-color: var(--slot-4-bg);
    color: var(--slot-4-fg);
  }
</style>
