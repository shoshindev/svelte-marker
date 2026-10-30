<!--
  Legacy syntax. Svelte 5 still accepts it, but new code should use the modern
  forms. It has its own file because Svelte doesn't allow mixing it with the
  modern syntax in test.svelte.
-->
<script>
  import Child from './Child.svelte';

  export let depth = 0;

  function go() {
    depth += 1;
  }
</script>

<button on:click|once={go} on:keydown>Old event directive</button>

<Child let:item>{item}</Child>

<Child>
  <svelte:fragment slot="row">Goes into a named slot</svelte:fragment>
</Child>

<svelte:component this={Child} />

{#if depth > 0}
  <svelte:self depth={depth - 1} />
{/if}
