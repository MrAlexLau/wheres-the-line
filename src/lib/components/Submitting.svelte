<script>
  import ScoreStrip from "./shared/ScoreStrip.svelte";
  import CriteriaCallout from "./shared/CriteriaCallout.svelte";
  import { round, myHand, submissions, me, isJudge, judgeName, uiError } from "../stores.js";
  import { sameId } from "../ids.js";
  import { submitCardAction } from "../client.js";

  $: mySubmission = $submissions.find((s) => sameId(s.player_id, $me?.id));

  function pickCard(row) {
    if (!mySubmission) return;
    submitCardAction(mySubmission.id, $me.id, row.id, row.card_text);
  }
</script>

<ScoreStrip />
<h2>Judge: {$judgeName}</h2>
<CriteriaCallout goal={$round.round_goal} judgeName={$judgeName} />
<div class="card condition">{$round.condition_card_text}</div>

{#if $isJudge}
  <p class="subtitle">You're judging this round — sit tight while everyone else submits.</p>
{:else if mySubmission?.submitted_at}
  <p class="subtitle">Card submitted! Waiting on the others…</p>
{:else}
  <h3>Your hand</h3>
  <div class="hand-grid">
    {#each $myHand as row (row.id)}
      <div
        class="card action"
        role="button"
        tabindex="0"
        on:click={() => pickCard(row)}
        on:keydown={(e) => (e.key === "Enter" || e.key === " ") && pickCard(row)}
      >
        {row.card_text}
      </div>
    {/each}
  </div>
  <div class="error-text">{$uiError}</div>
{/if}
