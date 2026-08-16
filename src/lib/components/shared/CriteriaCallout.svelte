<script>
  // goal prop kept for backward-compat call sites but no longer branches
  // anything — scoring always picks the best dare, so the goal is always
  // the same.
  export let goal = undefined;
  export let judgeName;
</script>

<div class="criteria-callout">
  <p class="criteria-main">Goal: play the <u>most intense</u> card that {judgeName} would do for:</p>
</div>
