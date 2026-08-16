<script>
  import { leaveRoom } from "../../client.js";

  function handleLeave() {
    if (window.confirm("Leave this game on this device? The room will remain available to the other players.")) {
      leaveRoom();
    }
  }
</script>

<details class="game-menu">
  <summary>Menu</summary>
  <button class="menu-leave" type="button" on:click={handleLeave}>Leave game</button>
</details>
