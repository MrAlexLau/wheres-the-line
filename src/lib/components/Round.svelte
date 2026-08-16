<script>
  import { round, room } from "../stores.js";
  import GameMenu from "./shared/GameMenu.svelte";
  import Submitting from "./Submitting.svelte";
  import Judging from "./Judging.svelte";
  import OrderWould from "./OrderWould.svelte";
  import Reveal from "./Reveal.svelte";
  import GameOver from "./GameOver.svelte";

  $: isGameOver = $round?.phase === "GAME_OVER" || $room?.status === "COMPLETE";
</script>

{#if isGameOver}
  <GameOver />
{:else}
  <div class="screen">
    <GameMenu />
    {#if !$round}
      <p>Setting up the round…</p>
    {:else if $round.phase === "SUBMITTING"}
      <Submitting />
    {:else if $round.phase === "JUDGING" && !$round.confirmed_at}
      <Judging />
    {:else if $round.phase === "JUDGING" && $round.confirmed_at}
      <OrderWould />
    {:else if $round.phase === "REVEAL"}
      <Reveal />
    {:else}
      <p>Unknown phase.</p>
    {/if}
  </div>
{/if}
