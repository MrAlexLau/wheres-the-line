<script>
  import { round, judgingSlots, submissions, isJudge, judgeName, uiBusy } from "../stores.js";
  import { sameId } from "../ids.js";
  import { applyBucketsAction, confirmJudgingAction } from "../client.js";
  import { dragSort } from "../dragSort.js";

  $: cardText = (submissionId) => $submissions.find((s) => sameId(s.id, submissionId))?.card_text ?? "";
  $: slotsFor = (bucket) => $judgingSlots.filter((s) => s.bucket === bucket).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  // Frozen snapshots, not the live reactive values, are what the template
  // renders from. While a drag is in progress this action's own DOM
  // surgery has exclusive control of the bucket lists — see dragSort.js's
  // comment for why a poll landing mid-drag otherwise causes Svelte's
  // reconciliation to fight with it (a card getting stuck floating,
  // duplicated against the list underneath).
  let dragging = false;
  let frozenWould = [];
  let frozenNeutral = [];
  let frozenWouldnt = [];
  $: if (!dragging) {
    frozenWould = slotsFor("WOULD");
    frozenNeutral = slotsFor("NEUTRAL");
    frozenWouldnt = slotsFor("WOULDNT");
  }

  // Stays frozen (dragSort.js has already put the DOM back to matching the
  // still-frozen pre-drop snapshot) until the write actually lands and the
  // store holds the corrected arrangement — then unfreezes once, straight
  // to the correct state, so Svelte performs the cross-bucket DOM move
  // itself instead of reconciling on top of this action's own manual
  // move. See dragSort.js for why doing it the other way around doubled
  // cards.
  async function handleDrop(wouldIds, neutralIds, wouldntIds) {
    await applyBucketsAction(wouldIds, wouldntIds, neutralIds);
    dragging = false;
  }
</script>

<div class="card condition">{$round.condition_card_text}</div>

{#if $isJudge}
  <h2>Where's the line?</h2>
  <p class="subtitle">
    Sort into <strong>Would do</strong> / <strong>Wouldn't do</strong>, ordering "Would do" from easiest (top) to most
    extreme (bottom). <strong>The bottom card in "Would do" wins</strong> — the least likely thing you'd still do.
  </p>
{:else}
  <p class="subtitle">{$judgeName} is deciding where the line is — the winning card is whichever one ends up at the bottom of "Would do."</p>
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
  <div class="bucket neutral-bucket">
    <div class="bucket-header neutral-header">🤔 Not sorted yet</div>
    <div class="bucket-cards">
      {#each frozenNeutral as s (s.id)}
        <div class="order-row card-row" data-sort-key={`slot:${s.id}`}>
          {#if $isJudge}<span class="drag-handle" aria-hidden="true">⠿</span>{/if}
          <div class="card action order-card">{cardText(s.submission_id)}</div>
        </div>
      {/each}
    </div>
  </div>
  <div class="bucket wouldnt-bucket">
    <div class="bucket-header wouldnt-header">🚫 Wouldn't do</div>
    <div class="bucket-cards">
      {#each frozenWouldnt as s (s.id)}
        <div class="order-row card-row" data-sort-key={`slot:${s.id}`}>
          {#if $isJudge}<span class="drag-handle" aria-hidden="true">⠿</span>{/if}
          <div class="card action order-card">{cardText(s.submission_id)}</div>
        </div>
      {/each}
    </div>
  </div>
</div>

{#if $isJudge}
  <button class="btn-primary" disabled={frozenNeutral.length > 0 || $uiBusy} on:click={confirmJudgingAction}>
    Confirm
  </button>
{/if}
