<script>
  import Brand from "./shared/Brand.svelte";
  import { form, uiBusy } from "../stores.js";
  import { createRoom, exitToHome } from "../client.js";
</script>

<div class="screen">
  <Brand />
  <h2>Host a room</h2>
  <div>
    <label for="host-name">Your name</label>
    <input id="host-name" type="text" maxlength="24" bind:value={$form.name} />
  </div>
  <div class="settings-grid">
    <div>
      <label for="target-score">Points to win</label>
      <input id="target-score" type="number" min="3" max="15" bind:value={$form.targetScore} />
    </div>
    <div>
      <label for="hand-size">Hand size</label>
      <input id="hand-size" type="number" min="5" max="10" bind:value={$form.handSize} />
    </div>
  </div>
  <div class="error-text">{$form.error}</div>
  <div class="btn-row">
    <button class="btn-primary" disabled={$uiBusy} on:click={createRoom}>
      {$uiBusy ? "Creating…" : "Create room"}
    </button>
    <button class="btn-secondary" on:click={exitToHome}>Back</button>
  </div>
</div>
