<script>
  import { round, judgingSlots, submissions, isJudge, judgeName, uiBusy, uiError } from "../stores.js";
  import { sameId } from "../ids.js";
  import { applyOrderAction, confirmJudgingAction } from "../client.js";
  import { dragSort } from "../dragSort.js";

  $: cardText = (submissionId) => $submissions.find((s) => sameId(s.id, submissionId))?.card_text ?? "";
  $: wouldSlots = $judgingSlots.filter((s) => s.bucket === "WOULD").sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  // Same frozen-snapshot pattern as Judging.svelte — see dragSort.js for why.
  let dragging = false;
  let frozenWould = [];
  $: if (!dragging) frozenWould = wouldSlots;

  async function handleDrop(orderedIds) {
    await applyOrderAction(orderedIds);
    dragging = false;
  }
</script>

<div class="card condition">{$round.condition_card_text}</div>

{#if $isJudge}
  <h2>Step 2: Rank them</h2>
  <p class="subtitle">
    Drag to order from easiest (top) to hardest (bottom). <strong>The bottom card wins</strong> — the least
    likely thing you'd still do.
  </p>
{:else}
  <p class="subtitle">{$judgeName} is ranking the "Would do" cards…</p>
{/if}

<div
  class="judge-order"
  class:read-only={!$isJudge}
  use:dragSort={{
    onDrop: handleDrop,
    onDragStart: () => (dragging = true),
    enabled: $isJudge && !dragging,
  }}
>
  <div class="bucket would-bucket">
    <div class="bucket-header would-header">✅ Would do <span class="bucket-hint">(top = easy, bottom = your limit)</span></div>
    <div class="bucket-cards">
      {#each frozenWould as s, i (s.id)}
        <div class="order-row card-row" data-sort-key={`slot:${s.id}`}>
          {#if $isJudge}<span class="drag-handle" aria-hidden="true">⠿</span>{/if}
          <div class="card action order-card">{cardText(s.submission_id)}</div>
          {#if i === frozenWould.length - 1}
            <span class="winner-badge">🏆 wins</span>
          {/if}
        </div>
      {/each}
    </div>
  </div>
</div>

{#if $isJudge}
  <button class="btn-primary" disabled={$uiBusy} on:click={confirmJudgingAction}>Confirm</button>
  <div class="error-text">{$uiError}</div>
{/if}
