<script>
  import { players } from "../../stores.js";
</script>

<div class="btn-row" style="font-size:0.8rem;color:var(--text-muted);">
  {$players.map((p) => `${p.display_name}: ${p.score}`).join("  ·  ")}
</div>
