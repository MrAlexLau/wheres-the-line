<script>
  import { round, judgingSlots, submissions, isJudge, judgeName, uiBusy } from "../stores.js";
  import { sameId } from "../ids.js";
  import { applyBucketsAction, confirmJudgingAction } from "../client.js";
  import { dragSort } from "../dragSort.js";

  $: cardText = (submissionId) => $submissions.find((s) => sameId(s.id, submissionId))?.card_text ?? "";
  $: slotsFor = (bucket) => $judgingSlots.filter((s) => s.bucket === bucket).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  $: wouldSlots = slotsFor("WOULD");
  $: neutralSlots = slotsFor("NEUTRAL");
  $: wouldntSlots = slotsFor("WOULDNT");

  function handleDrop(wouldIds, neutralIds, wouldntIds) {
    applyBucketsAction(wouldIds, wouldntIds, neutralIds);
  }
</script>

<div class="card condition">{$round.condition_card_text}</div>

{#if !$isJudge}
  <p class="subtitle">{$judgeName} is deciding where the line is…</p>
{:else}
  <h2>Where's the line?</h2>
  <p class="subtitle">Drag every card out of the middle pile into a bucket, ordering by how extreme it is.</p>

  <div class="judge-order" use:dragSort={{ onDrop: handleDrop }}>
    <div class="bucket would-bucket">
      <div class="bucket-header would-header">✅ Would do</div>
      <div class="bucket-cards">
        {#each wouldSlots as s (s.id)}
          <div class="order-row card-row" data-sort-key={`slot:${s.id}`}>
            <span class="drag-handle" aria-hidden="true">⠿</span>
            <div class="card action order-card">{cardText(s.submission_id)}</div>
          </div>
        {/each}
      </div>
    </div>
    <div class="bucket neutral-bucket">
      <div class="bucket-header neutral-header">🤔 Not sorted yet</div>
      <div class="bucket-cards">
        {#each neutralSlots as s (s.id)}
          <div class="order-row card-row" data-sort-key={`slot:${s.id}`}>
            <span class="drag-handle" aria-hidden="true">⠿</span>
            <div class="card action order-card">{cardText(s.submission_id)}</div>
          </div>
        {/each}
      </div>
    </div>
    <div class="bucket wouldnt-bucket">
      <div class="bucket-header wouldnt-header">🚫 Wouldn't do</div>
      <div class="bucket-cards">
        {#each wouldntSlots as s (s.id)}
          <div class="order-row card-row" data-sort-key={`slot:${s.id}`}>
            <span class="drag-handle" aria-hidden="true">⠿</span>
            <div class="card action order-card">{cardText(s.submission_id)}</div>
          </div>
        {/each}
      </div>
    </div>
  </div>

  <button class="btn-primary" disabled={neutralSlots.length > 0 || $uiBusy} on:click={confirmJudgingAction}>
    Confirm
  </button>
{/if}
