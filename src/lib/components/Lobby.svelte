<script>
  import Brand from "./shared/Brand.svelte";
  import { room, players, me, uiBusy, uiError } from "../stores.js";
  import { startGameAction, leaveRoom } from "../client.js";

  $: sortedPlayers = [...$players].sort((a, b) => a.join_order - b.join_order);
  $: iAmHost = $me?.is_host;
  $: canStart = $players.length >= 3;
</script>

<div class="screen">
  <Brand />
  <h2>Room code: {$room?.room_code}</h2>
  <p class="subtitle">Share this code — everyone joins from their own device.</p>

  <div class="player-list">
    {#each sortedPlayers as p (p.id)}
      <div class="player-row">
        <span>{p.display_name}{p.is_host ? " (host)" : ""}</span>
      </div>
    {/each}
  </div>

  {#if iAmHost}
    <button class="btn-primary" disabled={!canStart || $uiBusy} on:click={startGameAction}>
      {$uiBusy ? "Starting…" : "Start game"}
    </button>
    {#if !canStart}
      <p class="subtitle">Need at least 3 players to start.</p>
    {/if}
  {:else}
    <p class="subtitle">Waiting for the host to start…</p>
  {/if}

  <div class="error-text">{$uiError}</div>
  <button class="btn-secondary" on:click={leaveRoom}>Leave room</button>
</div>
