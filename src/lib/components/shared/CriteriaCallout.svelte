<script>
  export let goal;
  export let judgeName;

  $: headline =
    goal === "LEAST"
      ? `Goal: Submit an action that ${judgeName} WOULD NOT do`
      : goal === "BETWEEN"
        ? `Goal: Submit an action that ${judgeName} WOULD do, or WOULD NOT do`
        : `Goal: Submit an action that ${judgeName} WOULD do`;
</script>

<div class="criteria-callout">
  <p class="criteria-main">{headline}</p>
</div>
