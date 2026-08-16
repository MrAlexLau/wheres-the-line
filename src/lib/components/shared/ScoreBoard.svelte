<script>
  import { players } from "../../stores.js";

  export let list = null;

  $: sorted = list ?? [...$players].sort((a, b) => b.score - a.score);
</script>

<div class="scoreboard">
  {#each sorted as p, i (p.id)}
    <div class="score-row">
      <span><span class="rank">{i + 1}.</span>{p.display_name}</span>
      <span class="points">{p.score}</span>
    </div>
  {/each}
</div>
