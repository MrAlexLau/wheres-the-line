<script>
  // goal prop kept for backward-compat call sites but no longer branches
  // anything — scoring is always "the least likely thing the judge would
  // still do," so the goal is always the same.
  export let goal = undefined;
  export let judgeName;
</script>

<div class="criteria-callout">
  <p class="criteria-main">
    Goal: play the <u>LEAST likely</u> thing {judgeName} would <u>still do</u>
  </p>
  <p class="criteria-sub">Too tame and someone braver edges you out. Too wild and {judgeName} won't budge.</p>
</div>
