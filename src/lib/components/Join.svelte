<script>
  import Brand from "./shared/Brand.svelte";
  import { form, uiBusy } from "../stores.js";
  import { joinRoom, exitToHome } from "../client.js";
</script>

<div class="screen">
  <Brand />
  <h2>Join a room</h2>
  <div>
    <label for="join-name">Your name</label>
    <input id="join-name" type="text" maxlength="24" bind:value={$form.name} />
  </div>
  <div>
    <label for="room-code">Room code</label>
    <input id="room-code" type="text" maxlength="5" style="text-transform:uppercase;" bind:value={$form.roomCode} />
  </div>
  <div class="error-text">{$form.error}</div>
  <div class="btn-row">
    <button class="btn-primary" disabled={$uiBusy} on:click={joinRoom}>
      {$uiBusy ? "Joining…" : "Join room"}
    </button>
    <button class="btn-secondary" on:click={exitToHome}>Back</button>
  </div>
</div>
