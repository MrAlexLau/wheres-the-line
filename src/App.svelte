<script>
  import { onMount } from "svelte";
  import { loadSession } from "./lib/session.js";
  import { initRoomClient } from "./lib/client.js";
  import { screen } from "./lib/stores.js";
  import HostSetup from "./lib/components/HostSetup.svelte";
  import Join from "./lib/components/Join.svelte";
  import Lobby from "./lib/components/Lobby.svelte";
  import Round from "./lib/components/Round.svelte";

  // Mirrors the old main.js: a saved reconnect session skips the home
  // screen entirely and goes straight into the room app.
  let appView = loadSession() ? "room" : "home"; // "home" | "room"

  function enterRoom(initialScreen) {
    appView = "room";
    initRoomClient(initialScreen, () => {
      appView = "home";
    });
  }

  onMount(() => {
    if (appView === "room") {
      initRoomClient("lobby", () => {
        appView = "home";
      });
    }
  });
</script>

{#if appView === "home"}
  <div class="screen">
    <div class="brand">
      <h1>Where's <span class="accent">the Line</span></h1>
      <p>A party game about knowing your friends — now playable across devices.</p>
    </div>
    <h2>Start a multiplayer game</h2>
    <div class="btn-row">
      <button class="btn-primary" on:click={() => enterRoom("host-setup")}>Host a room</button>
      <button class="btn-secondary" on:click={() => enterRoom("join")}>Join a room</button>
    </div>
    <p class="subtitle pass-and-play-link">
      Only one device? <a href="/pass-and-play/">Play pass-and-play instead</a>.
    </p>
  </div>
{:else if $screen === "host-setup"}
  <HostSetup />
{:else if $screen === "join"}
  <Join />
{:else if $screen === "lobby"}
  <Lobby />
{:else if $screen === "in-round"}
  <Round />
{/if}
