<script>
  import Brand from "./shared/Brand.svelte";
  import ScoreBoard from "./shared/ScoreBoard.svelte";
  import { players } from "../stores.js";
  import { leaveRoom } from "../client.js";

  $: standings = [...$players].sort((a, b) => b.score - a.score);
  $: top = standings[0]?.score ?? 0;
  $: winners = standings.filter((p) => p.score >= top);
</script>

<div class="screen">
  <Brand />
  {#if winners.length > 1}
    <h2>It's a tie! {winners.map((w) => w.display_name).join(" & ")} win!</h2>
  {:else}
    <h2>{winners[0]?.display_name} wins!</h2>
  {/if}
  <h3>Final standings</h3>
  <ScoreBoard list={standings} />
  <button class="btn-secondary" on:click={leaveRoom}>Leave room</button>
</div>
