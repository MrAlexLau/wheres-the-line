<script>
  import ScoreBoard from "./shared/ScoreBoard.svelte";
  import { round, submissions, players, me, judgeName, uiBusy } from "../stores.js";
  import { sameId } from "../ids.js";
  import { nextRoundAction } from "../client.js";
</script>

<h2>Results</h2>
<p class="subtitle">Judged by {$judgeName} — for: "{$round.condition_card_text}"</p>

<div class="submission-list">
  {#each $submissions as s (s.id)}
    {@const player = $players.find((p) => sameId(p.id, s.player_id))}
    {@const scored = (s.round_score_delta || 0) > 0}
    <div class={`reveal-row${scored ? " winner" : ""}`}>
      <span class="player-name">{player?.display_name ?? "?"}</span>
      {s.card_text || ""}
      {#if scored}
        <span class="pick-tag most">🏆 Best dare (+1)</span>
      {/if}
    </div>
  {/each}
</div>

<h3>Scoreboard</h3>
<ScoreBoard />

{#if $me?.is_host}
  <button class="btn-primary" disabled={$uiBusy} on:click={nextRoundAction}>Next round</button>
{:else}
  <p class="subtitle">Waiting for the host to continue…</p>
{/if}
